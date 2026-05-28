package vehicle

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

type VehicleManager struct {
	rdb redis.Cmdable
	ttl time.Duration
}

func NewVehicleManager(rdb redis.Cmdable, ttl time.Duration) *VehicleManager {
	return &VehicleManager{
		rdb: rdb,
		ttl: ttl,
	}
}

// RegisterVehicle stores the vehicle JSON in Redis and adds it to the edge set.
func (vm *VehicleManager) RegisterVehicle(ctx context.Context, v *types.Vehicle) error {
	if v == nil || v.ID == "" {
		return fmt.Errorf("invalid vehicle")
	}

	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("failed to marshal vehicle: %w", err)
	}

	vehicleKey := fmt.Sprintf("vehicle:%s", v.ID)
	edgeKey := fmt.Sprintf("edge:%s:vehicles", v.CurrentEdge)

	pipe := vm.rdb.TxPipeline()
	pipe.Set(ctx, vehicleKey, data, vm.ttl)
	if v.CurrentEdge != "" {
		pipe.SAdd(ctx, edgeKey, string(v.ID))
	}

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to register vehicle in Redis: %w", err)
	}
	return nil
}

// UpdatePosition updates vehicle coordinates and handles edge set transition.
func (vm *VehicleManager) UpdatePosition(ctx context.Context, id types.VehicleID, lat, lng float64, newEdge types.EdgeID) error {
	vehicleKey := fmt.Sprintf("vehicle:%s", id)

	val, err := vm.rdb.Get(ctx, vehicleKey).Result()
	if err == redis.Nil {
		return fmt.Errorf("vehicle %s not found", id)
	} else if err != nil {
		return fmt.Errorf("failed to get vehicle: %w", err)
	}

	var v types.Vehicle
	if err := json.Unmarshal([]byte(val), &v); err != nil {
		return fmt.Errorf("failed to unmarshal vehicle: %w", err)
	}

	oldEdge := v.CurrentEdge
	v.Lat = lat
	v.Lng = lng
	v.CurrentEdge = newEdge

	newData, err := json.Marshal(&v)
	if err != nil {
		return fmt.Errorf("failed to marshal updated vehicle: %w", err)
	}

	pipe := vm.rdb.TxPipeline()
	pipe.Set(ctx, vehicleKey, newData, vm.ttl)

	if oldEdge != newEdge {
		if oldEdge != "" {
			pipe.SRem(ctx, fmt.Sprintf("edge:%s:vehicles", oldEdge), string(id))
		}
		if newEdge != "" {
			pipe.SAdd(ctx, fmt.Sprintf("edge:%s:vehicles", newEdge), string(id))
		}
	}

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to update position in Redis: %w", err)
	}
	return nil
}

// GetVehiclesOnEdge returns all active vehicles on an edge, cleaning up expired keys lazily.
func (vm *VehicleManager) GetVehiclesOnEdge(ctx context.Context, edgeID types.EdgeID) ([]*types.Vehicle, error) {
	edgeKey := fmt.Sprintf("edge:%s:vehicles", edgeID)

	members, err := vm.rdb.SMembers(ctx, edgeKey).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get members of edge set: %w", err)
	}

	var vehicles []*types.Vehicle
	for _, id := range members {
		vehicleKey := fmt.Sprintf("vehicle:%s", id)
		val, err := vm.rdb.Get(ctx, vehicleKey).Result()
		if err == redis.Nil {
			// Vehicle TTL expired, clean up index lazily
			_, _ = vm.rdb.SRem(ctx, edgeKey, id).Result()
		} else if err != nil {
			return nil, fmt.Errorf("failed to get vehicle %s: %w", id, err)
		} else {
			var v types.Vehicle
			if err := json.Unmarshal([]byte(val), &v); err == nil {
				vehicles = append(vehicles, &v)
			}
		}
	}

	return vehicles, nil
}

// GetVehicle retrieves a vehicle from Redis by ID.
func (vm *VehicleManager) GetVehicle(ctx context.Context, id types.VehicleID) (*types.Vehicle, error) {
	vehicleKey := fmt.Sprintf("vehicle:%s", id)
	val, err := vm.rdb.Get(ctx, vehicleKey).Result()
	if err == redis.Nil {
		return nil, fmt.Errorf("vehicle %s not found", id)
	} else if err != nil {
		return nil, fmt.Errorf("failed to get vehicle: %w", err)
	}

	var v types.Vehicle
	if err := json.Unmarshal([]byte(val), &v); err != nil {
		return nil, fmt.Errorf("failed to unmarshal vehicle: %w", err)
	}
	return &v, nil
}

// GetAllVehicles retrieves all registered vehicles from Redis by scanning key space for "vehicle:*".
func (vm *VehicleManager) GetAllVehicles(ctx context.Context) ([]*types.Vehicle, error) {
	var vehicles []*types.Vehicle
	var cursor uint64
	for {
		keys, nextCursor, err := vm.rdb.Scan(ctx, cursor, "vehicle:*", 100).Result()
		if err != nil {
			return nil, fmt.Errorf("failed to scan vehicle keys: %w", err)
		}
		for _, key := range keys {
			val, err := vm.rdb.Get(ctx, key).Result()
			if err == redis.Nil {
				continue
			} else if err != nil {
				return nil, fmt.Errorf("failed to get vehicle %s: %w", key, err)
			}
			var v types.Vehicle
			if err := json.Unmarshal([]byte(val), &v); err == nil {
				vehicles = append(vehicles, &v)
			}
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
	return vehicles, nil
}
