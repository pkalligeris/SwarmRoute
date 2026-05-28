package karma

import (
	"context"
	"math"

	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

// KarmaManager handles managing and tracking vehicle flow points in Redis.
type KarmaManager struct {
	rdb redis.Cmdable
}

// NewKarmaManager creates a new KarmaManager instance.
func NewKarmaManager(rdb redis.Cmdable) *KarmaManager {
	return &KarmaManager{rdb: rdb}
}

// CalculateFlowPoints calculates flow points based on travel time difference (10 points per minute detour).
func CalculateFlowPoints(acceptedRoute, optimalRoute types.Path) int {
	diffSeconds := acceptedRoute.EstimatedTime - optimalRoute.EstimatedTime
	diffMinutes := diffSeconds / 60.0
	roundedMinutes := math.Round(diffMinutes)
	points := int(roundedMinutes) * 10
	if points < 0 {
		return 0
	}
	return points
}

// AwardFlowPoints increments the vehicle's karma balance in Redis.
func (km *KarmaManager) AwardFlowPoints(ctx context.Context, id types.VehicleID, points int) error {
	key := "karma:" + string(id)
	return km.rdb.IncrBy(ctx, key, int64(points)).Err()
}

// SpendFlowPoints transactionally verifies the balance and deducts points.
func (km *KarmaManager) SpendFlowPoints(ctx context.Context, id types.VehicleID, points int) (bool, error) {
	key := "karma:" + string(id)
	script := `
		local key = KEYS[1]
		local amount = tonumber(ARGV[1])
		local balance = tonumber(redis.call("GET", key) or "0")
		if balance >= amount then
			redis.call("DECRBY", key, amount)
			return 1
		else
			return 0
		end
	`
	res, err := km.rdb.Eval(ctx, script, []string{key}, points).Int()
	if err != nil {
		return false, err
	}
	return res == 1, nil
}
