package iot

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/pkalligeris/SwarmRoute/internal/graph"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

func TestIngestReadingInMemory(t *testing.T) {
	// Initialize Graph
	g := graph.NewGraph()
	g.AddNode(&types.Node{ID: "A", Lat: 37.9756, Lng: 23.7348})
	g.AddNode(&types.Node{ID: "B", Lat: 37.9802, Lng: 23.7327})
	g.AddEdge(&types.Edge{
		ID:          "A-B",
		From:        "A",
		To:          "B",
		Distance:    1000.0,
		MaxCapacity: 10,
		CurrentLoad: 0,
	})

	// Create SensorManager with nil Redis (in-memory)
	sm := NewSensorManager(g, nil)

	// Register sensor associated with edge A-B
	err := sm.RegisterSensor(context.Background(), "sensor-1", "A-B")
	if err != nil {
		t.Fatalf("failed to register sensor: %v", err)
	}

	// Ingest reading: vehicle count 8, avg speed 10 km/h (below 15 km/h threshold)
	reading := types.SensorReading{
		SensorID:     "sensor-1",
		Timestamp:    time.Now(),
		VehicleCount: 8,
		AvgSpeed:     10.0,
	}

	err = sm.IngestReading(context.Background(), reading)
	if err != nil {
		t.Fatalf("failed to ingest reading: %v", err)
	}

	// Verify that the Graph edge load is updated to the sensor's reported count
	edge, exists := g.Edges["A-B"]
	if !exists {
		t.Fatalf("edge A-B not found in graph")
	}

	if edge.CurrentLoad != 8 {
		t.Errorf("expected edge load to be 8, got %d", edge.CurrentLoad)
	}

	// Calculate base time under free-flow: 1000m / 13.89 m/s = 71.99s
	// Under IoT override (10 km/h = 2.778 m/s): 1000m / 2.778 m/s = 360s
	// With 8 vehicles load factor (useDynamic = true):
	// loadFactor = 8 / 10 = 0.8
	// cost = 360 * (1 + 0.15 * 0.8^4) = 360 * (1 + 0.15 * 0.4096) = 360 * 1.06144 = 382.1184s
	// Apply speed penalty multiplier (since 10 km/h < 15 km/h):
	// 382.1184 * 1.5 = 573.1776s (if multiplier is 1.5x)
	// Let's verify that the calculated cost includes both speed override, dynamic BPR load, and congestion penalty.
	cost := g.CalculateEdgeCost(context.Background(), nil, edge, types.Civilian, true, "")

	// We expect the cost to be higher than static free flow cost (~72s)
	// And it should be exactly 573.1776s (we can test with tolerance)
	expectedCost := 573.1776
	tolerance := 0.1
	if cost < expectedCost-tolerance || cost > expectedCost+tolerance {
		t.Errorf("expected edge cost to be around %f, got %f", expectedCost, cost)
	}
}

func TestIngestReadingWithRedis(t *testing.T) {
	// Start miniredis
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})
	defer rdb.Close()

	// Initialize Graph
	g := graph.NewGraph()
	g.AddNode(&types.Node{ID: "A", Lat: 37.9756, Lng: 23.7348})
	g.AddNode(&types.Node{ID: "B", Lat: 37.9802, Lng: 23.7327})
	g.AddEdge(&types.Edge{
		ID:          "A-B",
		From:        "A",
		To:          "B",
		Distance:    1000.0,
		MaxCapacity: 10,
		CurrentLoad: 0,
	})

	// Create SensorManager with Redis
	sm := NewSensorManager(g, rdb)

	// Register sensor associated with edge A-B
	err = sm.RegisterSensor(context.Background(), "sensor-1", "A-B")
	if err != nil {
		t.Fatalf("failed to register sensor: %v", err)
	}

	// Ingest reading
	reading := types.SensorReading{
		SensorID:     "sensor-1",
		Timestamp:    time.Now(),
		VehicleCount: 8,
		AvgSpeed:     10.0,
	}

	err = sm.IngestReading(context.Background(), reading)
	if err != nil {
		t.Fatalf("failed to ingest reading: %v", err)
	}

	// Verify that the Graph edge load is updated to the sensor's reported count
	edge, exists := g.Edges["A-B"]
	if !exists {
		t.Fatalf("edge A-B not found in graph")
	}

	if edge.CurrentLoad != 8 {
		t.Errorf("expected edge load to be 8, got %d", edge.CurrentLoad)
	}

	// Verify cost calculation is affected by speed override from Redis
	cost := g.CalculateEdgeCost(context.Background(), rdb, edge, types.Civilian, true, "")
	expectedCost := 573.1776
	tolerance := 0.1
	if cost < expectedCost-tolerance || cost > expectedCost+tolerance {
		t.Errorf("expected edge cost with Redis to be around %f, got %f", expectedCost, cost)
	}
}
