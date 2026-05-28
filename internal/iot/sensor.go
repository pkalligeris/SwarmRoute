package iot

import (
	"context"
	"fmt"
	"sync"

	"github.com/pkalligeris/SwarmRoute/internal/graph"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

// SensorManager manages IoT sensors and ingests their readings.
type SensorManager struct {
	mu           sync.RWMutex
	graph        *graph.Graph
	rdb          redis.Cmdable
	sensorToEdge map[types.SensorID]types.EdgeID
}

// NewSensorManager creates a new SensorManager instance.
func NewSensorManager(g *graph.Graph, rdb redis.Cmdable) *SensorManager {
	return &SensorManager{
		graph:        g,
		rdb:          rdb,
		sensorToEdge: make(map[types.SensorID]types.EdgeID),
	}
}

// RegisterSensor registers a sensor associated with a graph edge.
func (sm *SensorManager) RegisterSensor(ctx context.Context, sensorID types.SensorID, edgeID types.EdgeID) error {
	sm.mu.Lock()
	sm.sensorToEdge[sensorID] = edgeID
	sm.mu.Unlock()

	if sm.rdb != nil {
		key := fmt.Sprintf("sensor:edge:%s", sensorID)
		err := sm.rdb.Set(ctx, key, string(edgeID), 0).Err()
		if err != nil {
			return fmt.Errorf("failed to register sensor in Redis: %w", err)
		}
	}
	return nil
}

// IngestReading ingests an IoT sensor reading, updates the edge's vehicle count,
// and sets the average speed (which may trigger a congestion penalty).
func (sm *SensorManager) IngestReading(ctx context.Context, reading types.SensorReading) error {
	var edgeID types.EdgeID
	var exists bool

	if sm.rdb != nil {
		key := fmt.Sprintf("sensor:edge:%s", reading.SensorID)
		val, err := sm.rdb.Get(ctx, key).Result()
		if err == nil {
			edgeID = types.EdgeID(val)
			exists = true
		} else if err != redis.Nil {
			return fmt.Errorf("failed to get sensor from Redis: %w", err)
		}
	}

	if !exists {
		sm.mu.RLock()
		edgeID, exists = sm.sensorToEdge[reading.SensorID]
		sm.mu.RUnlock()
	}

	if !exists {
		return fmt.Errorf("sensor %s is not registered to any edge", reading.SensorID)
	}

	// 1. Update the graph edge's CurrentLoad directly
	err := sm.graph.SetEdgeLoad(edgeID, reading.VehicleCount)
	if err != nil {
		return fmt.Errorf("failed to update graph edge load: %w", err)
	}

	// 2. Update the graph edge's IoT speed
	err = sm.graph.SetEdgeSpeed(edgeID, reading.AvgSpeed)
	if err != nil {
		return fmt.Errorf("failed to update graph edge speed: %w", err)
	}

	// 3. Store the status in Redis if Redis client is present
	if sm.rdb != nil {
		pipe := sm.rdb.TxPipeline()
		pipe.Set(ctx, fmt.Sprintf("edge:%s:load", edgeID), reading.VehicleCount, 0)
		pipe.Set(ctx, fmt.Sprintf("edge:%s:speed", edgeID), reading.AvgSpeed, 0)
		_, err := pipe.Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to store edge status in Redis: %w", err)
		}
	}

	return nil
}
