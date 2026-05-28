package orchestrator

import (
	"context"
	"fmt"
	"time"

	"github.com/pkalligeris/SwarmRoute/internal/graph"
	"github.com/pkalligeris/SwarmRoute/internal/karma"
	"github.com/pkalligeris/SwarmRoute/internal/vehicle"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

type Orchestrator struct {
	graph    *graph.Graph
	vehicles *vehicle.VehicleManager
	karma    *karma.KarmaManager
	rdb      redis.Cmdable
}

func NewOrchestrator(g *graph.Graph, vm *vehicle.VehicleManager, km *karma.KarmaManager, rdb redis.Cmdable) *Orchestrator {
	return &Orchestrator{
		graph:    g,
		vehicles: vm,
		karma:    km,
		rdb:      rdb,
	}
}

// RequestRoute calculates a route based on vehicle type, priority, fleet membership, and dynamic network load.
func (o *Orchestrator) RequestRoute(ctx context.Context, req types.RouteRequest) (types.RouteResponse, error) {
	// 1. Resolve FleetID from request or registered vehicle
	fleetID := req.FleetID
	if fleetID == "" && o.vehicles != nil {
		if v, err := o.vehicles.GetVehicle(ctx, req.VehicleID); err == nil && v != nil {
			fleetID = v.FleetID
		}
	}

	// 2. Determine if routing is selfish or dynamic BPR
	useDynamic := !req.Selfish

	// 3. Find optimal path using A*
	path, err := o.graph.FindPath(ctx, o.rdb, req.Origin, req.Destination, req.Type, useDynamic, fleetID)
	if err != nil {
		return types.RouteResponse{}, fmt.Errorf("failed to find path: %w", err)
	}

	// 4. Handle Karma logic for swarm routing
	flowPointsEarned := 0
	if useDynamic {
		// Calculate the reference selfish (shortest physical) path
		selfishPath, err := o.graph.FindPath(ctx, o.rdb, req.Origin, req.Destination, req.Type, false, fleetID)
		if err == nil {
			flowPointsEarned = karma.CalculateFlowPoints(path, selfishPath)
			if flowPointsEarned > 0 && o.karma != nil {
				_ = o.karma.AwardFlowPoints(ctx, req.VehicleID, flowPointsEarned)
			}
		}
	}

	// 5. Store emergency restrictions (Green Wave) in Redis if it's an emergency vehicle
	if (req.Emergency || req.Type == types.Emergency) && len(path.Edges) > 0 {
		for _, edgeID := range path.Edges {
			key := fmt.Sprintf("emergency_restricted:%s", edgeID)
			_ = o.rdb.Set(ctx, key, "1", 2*time.Minute).Err()
		}
	}

	// 6. Store fleet dispersion edges in Redis if a fleet ID is present
	if fleetID != "" && len(path.Edges) > 0 {
		for _, edgeID := range path.Edges {
			key := fmt.Sprintf("fleet:%s:edges:%s", fleetID, edgeID)
			_ = o.rdb.Set(ctx, key, "1", 5*time.Minute).Err()
		}
	}

	return types.RouteResponse{
		VehicleID:        req.VehicleID,
		Path:             path,
		FlowPointsEarned: flowPointsEarned,
	}, nil
}
