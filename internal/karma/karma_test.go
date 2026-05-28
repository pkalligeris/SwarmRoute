package karma

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

func TestCalculateFlowPoints(t *testing.T) {
	tests := []struct {
		name          string
		acceptedRoute types.Path
		optimalRoute  types.Path
		expected      int
	}{
		{
			name: "Standard detour - 12 mins vs 10 mins",
			acceptedRoute: types.Path{
				EstimatedTime: 720.0, // 12 minutes
			},
			optimalRoute: types.Path{
				EstimatedTime: 600.0, // 10 minutes
			},
			expected: 20,
		},
		{
			name: "No detour - same time",
			acceptedRoute: types.Path{
				EstimatedTime: 600.0,
			},
			optimalRoute: types.Path{
				EstimatedTime: 600.0,
			},
			expected: 0,
		},
		{
			name: "Negative detour - faster than optimal route (should be capped at 0)",
			acceptedRoute: types.Path{
				EstimatedTime: 500.0,
			},
			optimalRoute: types.Path{
				EstimatedTime: 600.0,
			},
			expected: 0,
		},
		{
			name: "Rounding up - 1.98 minutes detour (119 seconds)",
			acceptedRoute: types.Path{
				EstimatedTime: 719.0,
			},
			optimalRoute: types.Path{
				EstimatedTime: 600.0,
			},
			expected: 20,
		},
		{
			name: "Rounding down - 0.48 minutes detour (29 seconds)",
			acceptedRoute: types.Path{
				EstimatedTime: 629.0,
			},
			optimalRoute: types.Path{
				EstimatedTime: 600.0,
			},
			expected: 0,
		},
		{
			name: "Rounding up from boundary - 0.52 minutes detour (31 seconds)",
			acceptedRoute: types.Path{
				EstimatedTime: 631.0,
			},
			optimalRoute: types.Path{
				EstimatedTime: 600.0,
			},
			expected: 10,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateFlowPoints(tt.acceptedRoute, tt.optimalRoute)
			if got != tt.expected {
				t.Errorf("CalculateFlowPoints() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestAwardFlowPoints(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})
	defer rdb.Close()

	ctx := context.Background()
	km := NewKarmaManager(rdb)
	vehicleID := types.VehicleID("v1")

	// Award 50 points
	err = km.AwardFlowPoints(ctx, vehicleID, 50)
	if err != nil {
		t.Fatalf("AwardFlowPoints failed: %v", err)
	}

	val, err := rdb.Get(ctx, "karma:v1").Result()
	if err != nil {
		t.Fatalf("redis Get failed: %v", err)
	}
	if val != "50" {
		t.Errorf("expected balance to be 50, got %s", val)
	}

	// Award another 30 points
	err = km.AwardFlowPoints(ctx, vehicleID, 30)
	if err != nil {
		t.Fatalf("AwardFlowPoints failed: %v", err)
	}

	val, err = rdb.Get(ctx, "karma:v1").Result()
	if err != nil {
		t.Fatalf("redis Get failed: %v", err)
	}
	if val != "80" {
		t.Errorf("expected balance to be 80, got %s", val)
	}
}

func TestSpendFlowPoints(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})
	defer rdb.Close()

	ctx := context.Background()
	km := NewKarmaManager(rdb)
	vehicleID := types.VehicleID("v1")

	// Set initial balance to 80
	err = rdb.Set(ctx, "karma:v1", 80, 0).Err()
	if err != nil {
		t.Fatalf("redis Set failed: %v", err)
	}

	// Try to spend 100 points (insufficient points)
	ok, err := km.SpendFlowPoints(ctx, vehicleID, 100)
	if err != nil {
		t.Fatalf("SpendFlowPoints failed: %v", err)
	}
	if ok {
		t.Error("expected SpendFlowPoints to return false for insufficient points")
	}

	val, err := rdb.Get(ctx, "karma:v1").Result()
	if err != nil {
		t.Fatalf("redis Get failed: %v", err)
	}
	if val != "80" {
		t.Errorf("expected balance to remain 80, got %s", val)
	}

	// Award 50 points (now balance should be 130)
	err = km.AwardFlowPoints(ctx, vehicleID, 50)
	if err != nil {
		t.Fatalf("AwardFlowPoints failed: %v", err)
	}

	// Try to spend 100 points (sufficient points)
	ok, err = km.SpendFlowPoints(ctx, vehicleID, 100)
	if err != nil {
		t.Fatalf("SpendFlowPoints failed: %v", err)
	}
	if !ok {
		t.Error("expected SpendFlowPoints to return true for sufficient points")
	}

	val, err = rdb.Get(ctx, "karma:v1").Result()
	if err != nil {
		t.Fatalf("redis Get failed: %v", err)
	}
	if val != "30" {
		t.Errorf("expected balance to be reduced to 30, got %s", val)
	}
}
