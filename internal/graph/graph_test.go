package graph

import (
	"context"
	"math"
	"sync"
	"testing"

	"github.com/pkalligeris/SwarmRoute/pkg/types"
)

func TestHaversineDistance(t *testing.T) {
	dist := HaversineDistance(37.9756, 23.7348, 37.9841, 23.7280)
	expected := 1100.0
	tolerance := 50.0
	if math.Abs(dist-expected) > tolerance {
		t.Errorf("HaversineDistance(Syntagma, Omonia) = %f; expected close to %f (tolerance %f)", dist, expected, tolerance)
	}
}

func TestAStarStatic(t *testing.T) {
	g := NewGraph()
	g.AddNode(&types.Node{ID: "A", Lat: 37.9756, Lng: 23.7348})
	g.AddNode(&types.Node{ID: "B", Lat: 37.9802, Lng: 23.7327})
	g.AddNode(&types.Node{ID: "C", Lat: 37.9841, Lng: 23.7280})

	g.AddEdge(&types.Edge{ID: "A-B", From: "A", To: "B", Distance: 550.0, MaxCapacity: 10})
	g.AddEdge(&types.Edge{ID: "B-C", From: "B", To: "C", Distance: 600.0, MaxCapacity: 10})
	g.AddEdge(&types.Edge{ID: "A-C", From: "A", To: "C", Distance: 2500.0, MaxCapacity: 10})

	path, err := g.FindPath(context.Background(), nil, "A", "C", types.Civilian, false, "")
	if err != nil {
		t.Fatalf("FindPath failed: %v", err)
	}

	expectedEdges := []types.EdgeID{"A-B", "B-C"}
	if len(path.Edges) != len(expectedEdges) {
		t.Errorf("expected path edges %v, got %v", expectedEdges, path.Edges)
	} else {
		for i, v := range expectedEdges {
			if path.Edges[i] != v {
				t.Errorf("at index %d, expected edge %s, got %s", i, v, path.Edges[i])
			}
		}
	}

	if path.TotalDistance != 1150.0 {
		t.Errorf("expected total distance 1150.0, got %f", path.TotalDistance)
	}
}

func TestHeavyTransportConstraint(t *testing.T) {
	g := NewGraph()
	g.AddNode(&types.Node{ID: "A", Lat: 37.9756, Lng: 23.7348})
	g.AddNode(&types.Node{ID: "B", Lat: 37.9802, Lng: 23.7327})
	g.AddNode(&types.Node{ID: "C", Lat: 37.9841, Lng: 23.7280})

	g.AddEdge(&types.Edge{
		ID:          "A-B",
		From:        "A",
		To:          "B",
		Distance:    550.0,
		MaxCapacity: 10,
		Constraints: []types.VehicleType{types.Civilian},
	})
	g.AddEdge(&types.Edge{
		ID:          "A-C",
		From:        "A",
		To:          "C",
		Distance:    600.0,
		MaxCapacity: 10,
		Constraints: []types.VehicleType{types.HeavyTransport},
	})
	g.AddEdge(&types.Edge{
		ID:          "C-B",
		From:        "C",
		To:          "B",
		Distance:    600.0,
		MaxCapacity: 10,
		Constraints: []types.VehicleType{types.HeavyTransport},
	})

	// Civilian should take direct route (A-B)
	pathCiv, err := g.FindPath(context.Background(), nil, "A", "B", types.Civilian, false, "")
	if err != nil {
		t.Fatalf("FindPath for Civilian failed: %v", err)
	}
	expectedCiv := []types.EdgeID{"A-B"}
	if len(pathCiv.Edges) != 1 || pathCiv.Edges[0] != "A-B" {
		t.Errorf("Civilian: expected edges %v, got %v", expectedCiv, pathCiv.Edges)
	}

	// HeavyTransport should take detour (A-C, C-B) because of the 10x penalty on A-B
	pathHT, err := g.FindPath(context.Background(), nil, "A", "B", types.HeavyTransport, false, "")
	if err != nil {
		t.Fatalf("FindPath for HeavyTransport failed: %v", err)
	}
	expectedHT := []types.EdgeID{"A-C", "C-B"}
	if len(pathHT.Edges) != 2 || pathHT.Edges[0] != "A-C" || pathHT.Edges[1] != "C-B" {
		t.Errorf("HeavyTransport: expected edges %v, got %v", expectedHT, pathHT.Edges)
	}
}

func TestDynamicBPRRouting(t *testing.T) {
	g := NewGraph()
	g.AddNode(&types.Node{ID: "A", Lat: 37.9756, Lng: 23.7348})
	g.AddNode(&types.Node{ID: "B", Lat: 37.9802, Lng: 23.7327})
	g.AddNode(&types.Node{ID: "C", Lat: 37.9841, Lng: 23.7280})

	g.AddEdge(&types.Edge{ID: "A-B", From: "A", To: "B", Distance: 1000.0, MaxCapacity: 10, CurrentLoad: 10})
	g.AddEdge(&types.Edge{ID: "B-C", From: "B", To: "C", Distance: 1000.0, MaxCapacity: 10, CurrentLoad: 10})
	g.AddEdge(&types.Edge{ID: "A-C", From: "A", To: "C", Distance: 2100.0, MaxCapacity: 10, CurrentLoad: 0})

	path, err := g.FindPath(context.Background(), nil, "A", "C", types.Civilian, true, "")
	if err != nil {
		t.Fatalf("FindPath failed: %v", err)
	}

	expectedEdges := []types.EdgeID{"A-C"}
	if len(path.Edges) != len(expectedEdges) || path.Edges[0] != "A-C" {
		t.Errorf("expected path edges %v, got %v", expectedEdges, path.Edges)
	}
}

func TestUpdateEdgeLoad(t *testing.T) {
	g := NewGraph()
	edgeID := types.EdgeID("A-B")
	g.AddEdge(&types.Edge{ID: edgeID, From: "A", To: "B", Distance: 550.0, MaxCapacity: 100, CurrentLoad: 50})

	var wg sync.WaitGroup
	workers := 100
	deltas := make([]int, workers)
	for i := 0; i < workers; i++ {
		if i%2 == 0 {
			deltas[i] = 1
		} else {
			deltas[i] = -1
		}
	}

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(delta int) {
			defer wg.Done()
			_ = g.UpdateEdgeLoad(edgeID, delta)
		}(deltas[i])
	}
	wg.Wait()

	g.mu.RLock()
	finalLoad := g.Edges[edgeID].CurrentLoad
	g.mu.RUnlock()

	expectedLoad := 50
	if finalLoad != expectedLoad {
		t.Errorf("expected final load %d, got %d", expectedLoad, finalLoad)
	}
}
