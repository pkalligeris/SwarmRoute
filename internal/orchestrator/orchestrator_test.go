package orchestrator

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/pkalligeris/SwarmRoute/internal/graph"
	"github.com/pkalligeris/SwarmRoute/internal/karma"
	"github.com/pkalligeris/SwarmRoute/internal/vehicle"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

func setupTestResources(t *testing.T) (*graph.Graph, *vehicle.VehicleManager, *karma.KarmaManager, *redis.Client, *miniredis.Miniredis) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	g := graph.NewGraph()
	// Common Nodes
	g.AddNode(&types.Node{ID: "A", Lat: 37.9756, Lng: 23.7348})
	g.AddNode(&types.Node{ID: "B", Lat: 37.9802, Lng: 23.7327})
	g.AddNode(&types.Node{ID: "C", Lat: 37.9841, Lng: 23.7280})

	vm := vehicle.NewVehicleManager(rdb, 10*time.Minute)
	km := karma.NewKarmaManager(rdb)

	return g, vm, km, rdb, mr
}

func TestRequestRouteSelfishVsSwarm(t *testing.T) {
	g, vm, km, rdb, mr := setupTestResources(t)
	defer mr.Close()
	defer rdb.Close()

	// A-B-C is the direct path but heavily congested (current load 20, max capacity 10)
	// A-C is an empty detour (distance 3000m)
	g.AddEdge(&types.Edge{ID: "A-B", From: "A", To: "B", Distance: 1000.0, MaxCapacity: 10, CurrentLoad: 20})
	g.AddEdge(&types.Edge{ID: "B-C", From: "B", To: "C", Distance: 1000.0, MaxCapacity: 10, CurrentLoad: 20})
	g.AddEdge(&types.Edge{ID: "A-C", From: "A", To: "C", Distance: 3000.0, MaxCapacity: 10, CurrentLoad: 0})

	orch := NewOrchestrator(g, vm, km, rdb)
	ctx := context.Background()

	// Register a civilian vehicle v1
	v1 := &types.Vehicle{
		ID:     "v1",
		Type:   types.Civilian,
		Origin: "A",
	}
	if err := vm.RegisterVehicle(ctx, v1); err != nil {
		t.Fatalf("failed to register vehicle: %v", err)
	}

	// 1. Case 1: Driver is selfish (Selfish: true). Expects congested A-B-C path.
	reqSelfish := types.RouteRequest{
		VehicleID:   "v1",
		Origin:      "A",
		Destination: "C",
		Type:        types.Civilian,
		Selfish:     true,
	}
	resSelfish, err := orch.RequestRoute(ctx, reqSelfish)
	if err != nil {
		t.Fatalf("RequestRoute selfish failed: %v", err)
	}

	expectedSelfishEdges := []types.EdgeID{"A-B", "B-C"}
	if len(resSelfish.Path.Edges) != len(expectedSelfishEdges) {
		t.Errorf("Selfish path expected edges %v, got %v", expectedSelfishEdges, resSelfish.Path.Edges)
	} else {
		for i, edge := range expectedSelfishEdges {
			if resSelfish.Path.Edges[i] != edge {
				t.Errorf("Selfish path expected edge %s at index %d, got %s", edge, i, resSelfish.Path.Edges[i])
			}
		}
	}
	if resSelfish.FlowPointsEarned != 0 {
		t.Errorf("Selfish driver should earn 0 flow points, got %d", resSelfish.FlowPointsEarned)
	}

	// 2. Case 2: Driver is swarm (Selfish: false). Expects detour A-C path.
	reqSwarm := types.RouteRequest{
		VehicleID:   "v1",
		Origin:      "A",
		Destination: "C",
		Type:        types.Civilian,
		Selfish:     false,
	}
	resSwarm, err := orch.RequestRoute(ctx, reqSwarm)
	if err != nil {
		t.Fatalf("RequestRoute swarm failed: %v", err)
	}

	expectedSwarmEdges := []types.EdgeID{"A-C"}
	if len(resSwarm.Path.Edges) != len(expectedSwarmEdges) || resSwarm.Path.Edges[0] != "A-C" {
		t.Errorf("Swarm path expected edges %v, got %v", expectedSwarmEdges, resSwarm.Path.Edges)
	}

	// Assert flow points are earned & updated in Redis
	// Detour time: 3000/13.89 = 216.0s
	// Selfish time: 2000/13.89 = 144.0s
	// Difference: 72.0s = 1.2 minutes. Rounds to 1.0 minutes = 10 points.
	if resSwarm.FlowPointsEarned != 10 {
		t.Errorf("Expected exactly 10 flow points earned, got %d", resSwarm.FlowPointsEarned)
	}

	// Verify points in Redis
	val, err := rdb.Get(ctx, "karma:v1").Result()
	if err != nil {
		t.Fatalf("redis Get failed: %v", err)
	}
	if val != "10" {
		t.Errorf("expected 10 karma points in Redis, got %s", val)
	}
}

func TestRequestRouteEmergency(t *testing.T) {
	g, vm, km, rdb, mr := setupTestResources(t)
	defer mr.Close()
	defer rdb.Close()

	// Shortest physical path: A-B-C (2000m) vs Detour A-C (2100m)
	g.AddEdge(&types.Edge{ID: "A-B", From: "A", To: "B", Distance: 1000.0, MaxCapacity: 10})
	g.AddEdge(&types.Edge{ID: "B-C", From: "B", To: "C", Distance: 1000.0, MaxCapacity: 10})
	g.AddEdge(&types.Edge{ID: "A-C", From: "A", To: "C", Distance: 2100.0, MaxCapacity: 10})

	orch := NewOrchestrator(g, vm, km, rdb)
	ctx := context.Background()

	// Request route for emergency vehicle
	reqEmergency := types.RouteRequest{
		VehicleID:   "v1",
		Origin:      "A",
		Destination: "C",
		Type:        types.Emergency,
		Emergency:   true,
	}

	resEmergency, err := orch.RequestRoute(ctx, reqEmergency)
	if err != nil {
		t.Fatalf("RequestRoute emergency failed: %v", err)
	}

	expectedEdges := []types.EdgeID{"A-B", "B-C"}
	if len(resEmergency.Path.Edges) != len(expectedEdges) {
		t.Fatalf("Emergency path expected edges %v, got %v", expectedEdges, resEmergency.Path.Edges)
	}

	// Assert edges on the emergency path are marked in Redis
	for _, edgeID := range expectedEdges {
		restrictedKey := "emergency_restricted:" + string(edgeID)
		exists, err := rdb.Exists(ctx, restrictedKey).Result()
		if err != nil {
			t.Fatalf("failed to check key %s: %v", restrictedKey, err)
		}
		if exists == 0 {
			t.Errorf("expected restricted key %s to exist in Redis", restrictedKey)
		}

		ttl, err := rdb.TTL(ctx, restrictedKey).Result()
		if err != nil {
			t.Fatalf("failed to get TTL: %v", err)
		}
		if ttl <= 0 || ttl > 2*time.Minute {
			t.Errorf("expected TTL for restricted key to be ~2 minutes, got %v", ttl)
		}
	}

	// Request route for civilian vehicle v2
	reqCivilian := types.RouteRequest{
		VehicleID:   "v2",
		Origin:      "A",
		Destination: "C",
		Type:        types.Civilian,
		Emergency:   false,
	}

	resCivilian, err := orch.RequestRoute(ctx, reqCivilian)
	if err != nil {
		t.Fatalf("RequestRoute civilian failed: %v", err)
	}

	// Civilian should bypass A-B-C and take A-C instead due to the emergency restricted edges
	expectedCivEdges := []types.EdgeID{"A-C"}
	if len(resCivilian.Path.Edges) != len(expectedCivEdges) || resCivilian.Path.Edges[0] != "A-C" {
		t.Errorf("Civilian path expected edges %v, got %v", expectedCivEdges, resCivilian.Path.Edges)
	}
}

func TestRequestRouteFleet(t *testing.T) {
	g, vm, km, rdb, mr := setupTestResources(t)
	defer mr.Close()
	defer rdb.Close()

	// Shortest physical path: A-B-C (2000m) vs Detour A-C (2100m)
	g.AddEdge(&types.Edge{ID: "A-B", From: "A", To: "B", Distance: 1000.0, MaxCapacity: 10})
	g.AddEdge(&types.Edge{ID: "B-C", From: "B", To: "C", Distance: 1000.0, MaxCapacity: 10})
	g.AddEdge(&types.Edge{ID: "A-C", From: "A", To: "C", Distance: 2100.0, MaxCapacity: 10})

	orch := NewOrchestrator(g, vm, km, rdb)
	ctx := context.Background()

	// Register 2 vehicles of same fleet "fleet_a", and 1 vehicle of different fleet "fleet_b"
	van1 := &types.Vehicle{ID: "van1", Type: types.Delivery, Origin: "A", FleetID: "fleet_a"}
	van2 := &types.Vehicle{ID: "van2", Type: types.Delivery, Origin: "A", FleetID: "fleet_a"}
	van3 := &types.Vehicle{ID: "van3", Type: types.Delivery, Origin: "A", FleetID: "fleet_b"}

	if err := vm.RegisterVehicle(ctx, van1); err != nil {
		t.Fatalf("failed to register van1: %v", err)
	}
	if err := vm.RegisterVehicle(ctx, van2); err != nil {
		t.Fatalf("failed to register van2: %v", err)
	}
	if err := vm.RegisterVehicle(ctx, van3); err != nil {
		t.Fatalf("failed to register van3: %v", err)
	}

	// Request route for van1 (fleet_a). It should receive shortest path.
	req1 := types.RouteRequest{
		VehicleID:   "van1",
		Origin:      "A",
		Destination: "C",
		Type:        types.Delivery,
		FleetID:     "fleet_a",
	}
	res1, err := orch.RequestRoute(ctx, req1)
	if err != nil {
		t.Fatalf("RequestRoute van1 failed: %v", err)
	}

	expectedEdges1 := []types.EdgeID{"A-B", "B-C"}
	if len(res1.Path.Edges) != len(expectedEdges1) {
		t.Fatalf("van1 expected path %v, got %v", expectedEdges1, res1.Path.Edges)
	}

	// Assert edges are in Redis under fleet prefix
	for _, edgeID := range expectedEdges1 {
		fleetKey := "fleet:fleet_a:edges:" + string(edgeID)
		exists, err := rdb.Exists(ctx, fleetKey).Result()
		if err != nil {
			t.Fatalf("failed to check key %s: %v", fleetKey, err)
		}
		if exists == 0 {
			t.Errorf("expected fleet key %s to exist in Redis", fleetKey)
		}

		ttl, err := rdb.TTL(ctx, fleetKey).Result()
		if err != nil {
			t.Fatalf("failed to get TTL: %v", err)
		}
		if ttl <= 0 || ttl > 5*time.Minute {
			t.Errorf("expected TTL for fleet key to be ~5 minutes, got %v", ttl)
		}
	}

	// Request route for van2 (fleet_a). It should receive detour because of same fleet penalty.
	req2 := types.RouteRequest{
		VehicleID:   "van2",
		Origin:      "A",
		Destination: "C",
		Type:        types.Delivery,
		FleetID:     "fleet_a",
	}
	res2, err := orch.RequestRoute(ctx, req2)
	if err != nil {
		t.Fatalf("RequestRoute van2 failed: %v", err)
	}

	expectedEdges2 := []types.EdgeID{"A-C"}
	if len(res2.Path.Edges) != len(expectedEdges2) || res2.Path.Edges[0] != "A-C" {
		t.Errorf("van2 expected detour path %v, got %v", expectedEdges2, res2.Path.Edges)
	}

	// Request route for van3 (fleet_b). It should receive shortest path because penalty is intra-fleet only.
	req3 := types.RouteRequest{
		VehicleID:   "van3",
		Origin:      "A",
		Destination: "C",
		Type:        types.Delivery,
		FleetID:     "fleet_b",
	}
	res3, err := orch.RequestRoute(ctx, req3)
	if err != nil {
		t.Fatalf("RequestRoute van3 failed: %v", err)
	}

	if len(res3.Path.Edges) != len(expectedEdges1) {
		t.Errorf("van3 (different fleet) expected shortest path %v, got %v", expectedEdges1, res3.Path.Edges)
	}
}
