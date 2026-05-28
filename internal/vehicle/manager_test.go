package vehicle

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

func TestRegisterVehicle(t *testing.T) {
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
	manager := NewVehicleManager(rdb, 10*time.Second)

	v1 := &types.Vehicle{
		ID:          "v1",
		Type:        types.Civilian,
		Origin:      "A",
		Destination: "B",
		CurrentEdge: "A-B",
		Priority:    1,
		FlowPoints:  0,
		Lat:         37.9756,
		Lng:         23.7348,
	}

	err = manager.RegisterVehicle(ctx, v1)
	if err != nil {
		t.Fatalf("RegisterVehicle failed: %v", err)
	}

	// Assert the Redis key "vehicle:v1" contains the serialized JSON
	val, err := rdb.Get(ctx, "vehicle:v1").Result()
	if err != nil {
		t.Fatalf("failed to get vehicle:v1 from redis: %v", err)
	}

	var stored types.Vehicle
	if err := json.Unmarshal([]byte(val), &stored); err != nil {
		t.Fatalf("failed to unmarshal stored vehicle: %v", err)
	}

	if stored.ID != v1.ID || stored.CurrentEdge != v1.CurrentEdge || stored.Lat != v1.Lat || stored.Lng != v1.Lng {
		t.Errorf("stored vehicle does not match registered vehicle. Got %+v, expected %+v", stored, v1)
	}

	// Assert the Redis Set "edge:A-B:vehicles" contains "v1"
	isMember, err := rdb.SIsMember(ctx, "edge:A-B:vehicles", "v1").Result()
	if err != nil {
		t.Fatalf("failed to check set membership: %v", err)
	}
	if !isMember {
		t.Errorf("expected v1 to be a member of edge:A-B:vehicles set")
	}
}

func TestUpdatePosition(t *testing.T) {
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
	manager := NewVehicleManager(rdb, 10*time.Second)

	v1 := &types.Vehicle{
		ID:          "v1",
		Type:        types.Civilian,
		Origin:      "A",
		Destination: "B",
		CurrentEdge: "A-B",
		Priority:    1,
		FlowPoints:  0,
		Lat:         37.9756,
		Lng:         23.7348,
	}

	// Register first
	if err := manager.RegisterVehicle(ctx, v1); err != nil {
		t.Fatalf("RegisterVehicle failed: %v", err)
	}

	// Update position to edge B-C
	newLat := 37.9802
	newLng := 23.7327
	newEdge := types.EdgeID("B-C")

	err = manager.UpdatePosition(ctx, "v1", newLat, newLng, newEdge)
	if err != nil {
		t.Fatalf("UpdatePosition failed: %v", err)
	}

	// Assert vehicle JSON reflects the new coordinates and edge
	val, err := rdb.Get(ctx, "vehicle:v1").Result()
	if err != nil {
		t.Fatalf("failed to get vehicle:v1 from redis: %v", err)
	}

	var stored types.Vehicle
	if err := json.Unmarshal([]byte(val), &stored); err != nil {
		t.Fatalf("failed to unmarshal vehicle: %v", err)
	}

	if stored.Lat != newLat || stored.Lng != newLng || stored.CurrentEdge != newEdge {
		t.Errorf("stored vehicle details not updated properly. Got lat=%f, lng=%f, edge=%s", stored.Lat, stored.Lng, stored.CurrentEdge)
	}

	// Assert v1 removed from old edge set
	isOldMember, err := rdb.SIsMember(ctx, "edge:A-B:vehicles", "v1").Result()
	if err != nil {
		t.Fatalf("failed to check old set: %v", err)
	}
	if isOldMember {
		t.Errorf("expected v1 to be removed from edge:A-B:vehicles set")
	}

	// Assert v1 added to new edge set
	isNewMember, err := rdb.SIsMember(ctx, "edge:B-C:vehicles", "v1").Result()
	if err != nil {
		t.Fatalf("failed to check new set: %v", err)
	}
	if !isNewMember {
		t.Errorf("expected v1 to be added to edge:B-C:vehicles set")
	}
}

func TestGetVehiclesOnEdgeWithTTL(t *testing.T) {
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
	manager := NewVehicleManager(rdb, 10*time.Second)

	v1 := &types.Vehicle{
		ID:          "v1",
		Type:        types.Civilian,
		Origin:      "A",
		Destination: "B",
		CurrentEdge: "B-C",
		Priority:    1,
		FlowPoints:  0,
		Lat:         37.9802,
		Lng:         23.7327,
	}

	if err := manager.RegisterVehicle(ctx, v1); err != nil {
		t.Fatalf("RegisterVehicle failed: %v", err)
	}

	// Verify it's returned initially
	vehicles, err := manager.GetVehiclesOnEdge(ctx, "B-C")
	if err != nil {
		t.Fatalf("GetVehiclesOnEdge failed: %v", err)
	}
	if len(vehicles) != 1 || vehicles[0].ID != "v1" {
		t.Fatalf("expected 1 vehicle (v1), got: %v", vehicles)
	}

	// Fast-forward time by 11 seconds to trigger expiry
	mr.FastForward(11 * time.Second)

	// Fetch vehicles again
	vehicles, err = manager.GetVehiclesOnEdge(ctx, "B-C")
	if err != nil {
		t.Fatalf("GetVehiclesOnEdge after expiry failed: %v", err)
	}

	// Assert that returned list is empty
	if len(vehicles) != 0 {
		t.Errorf("expected 0 vehicles after TTL expiration, got %d", len(vehicles))
	}

	// Assert key vehicle:v1 is deleted/expired
	_, err = rdb.Get(ctx, "vehicle:v1").Result()
	if err != redis.Nil {
		t.Errorf("expected vehicle:v1 key to be deleted or nil, got err: %v", err)
	}

	// Assert set edge:B-C:vehicles has had v1 removed
	isMember, err := rdb.SIsMember(ctx, "edge:B-C:vehicles", "v1").Result()
	if err != nil {
		t.Fatalf("failed to check set membership: %v", err)
	}
	if isMember {
		t.Errorf("expected v1 to be removed from edge:B-C:vehicles set after lazy self-cleanup")
	}
}
