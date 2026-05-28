package graph

import (
	"container/heap"
	"context"
	"fmt"
	"math"
	"sync"

	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

// DefaultSpeed is the free-flow speed in m/s (approx 50 km/h)
const DefaultSpeed = 13.89

// Graph represents a weighted directed graph of the road network.
type Graph struct {
	mu            sync.RWMutex
	Nodes         map[types.NodeID]*types.Node
	Edges         map[types.EdgeID]*types.Edge
	Adjacency     map[types.NodeID][]*types.Edge
	IoTEdgeSpeeds map[types.EdgeID]float64 // in km/h
}

// NewGraph creates and initializes a new Graph.
func NewGraph() *Graph {
	return &Graph{
		Nodes:         make(map[types.NodeID]*types.Node),
		Edges:         make(map[types.EdgeID]*types.Edge),
		Adjacency:     make(map[types.NodeID][]*types.Edge),
		IoTEdgeSpeeds: make(map[types.EdgeID]float64),
	}
}

// AddNode adds a node to the graph in a thread-safe manner.
func (g *Graph) AddNode(node *types.Node) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.Nodes[node.ID] = node
}

// AddEdge adds an edge to the graph in a thread-safe manner.
func (g *Graph) AddEdge(edge *types.Edge) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.Edges[edge.ID] = edge
	g.Adjacency[edge.From] = append(g.Adjacency[edge.From], edge)
}

// HaversineDistance computes the great-circle distance between two coordinates in meters.
func HaversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371000.0 // Earth radius in meters
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLng := (lng2 - lng1) * math.Pi / 180.0
	rLat1 := lat1 * math.Pi / 180.0
	rLat2 := lat2 * math.Pi / 180.0

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rLat1)*math.Cos(rLat2)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

// CalculateEdgeCost calculates travel time on an edge (in seconds) considering vehicle type and dynamic congestion.
func (g *Graph) CalculateEdgeCost(ctx context.Context, rdb redis.Cmdable, edge *types.Edge, vehicleType types.VehicleType, useDynamic bool, fleetID string) float64 {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.calculateEdgeCostLocked(ctx, rdb, edge, vehicleType, useDynamic, fleetID)
}

func (g *Graph) calculateEdgeCostLocked(ctx context.Context, rdb redis.Cmdable, edge *types.Edge, vehicleType types.VehicleType, useDynamic bool, fleetID string) float64 {
	speed := DefaultSpeed
	var iotSpeed float64
	var foundIoT bool

	if useDynamic {
		if rdb != nil && ctx != nil {
			speedKey := fmt.Sprintf("edge:%s:speed", edge.ID)
			val, err := rdb.Get(ctx, speedKey).Float64()
			if err == nil {
				iotSpeed = val
				foundIoT = true
			}
		}
		if !foundIoT && g.IoTEdgeSpeeds != nil {
			if val, exists := g.IoTEdgeSpeeds[edge.ID]; exists {
				iotSpeed = val
				foundIoT = true
			}
		}
	}

	if foundIoT && iotSpeed > 0 {
		speed = iotSpeed / 3.6
	}

	freeFlowTime := edge.Distance / speed
	cost := freeFlowTime

	if vehicleType == types.HeavyTransport {
		hasHT := false
		for _, c := range edge.Constraints {
			if c == types.HeavyTransport {
				hasHT = true
				break
			}
		}
		if len(edge.Constraints) > 0 && !hasHT {
			cost *= 10.0
		}
	}

	if useDynamic && edge.MaxCapacity > 0 {
		loadFactor := float64(edge.CurrentLoad) / float64(edge.MaxCapacity)
		cost = cost * (1.0 + 0.15*math.Pow(loadFactor, 4))
	}

	if useDynamic && foundIoT && iotSpeed < 15.0 {
		cost *= 1.5
	}

	// 1. Emergency priority lockout for civilian (non-emergency) vehicles
	if rdb != nil && ctx != nil && vehicleType != types.Emergency {
		restrictedKey := fmt.Sprintf("emergency_restricted:%s", edge.ID)
		exists, err := rdb.Exists(ctx, restrictedKey).Result()
		if err == nil && exists > 0 {
			cost *= 100.0 // 100x penalty
		}
	}

	// 2. Delivery fleet dispersion penalty
	if rdb != nil && ctx != nil && fleetID != "" {
		fleetKey := fmt.Sprintf("fleet:%s:edges:%s", fleetID, edge.ID)
		exists, err := rdb.Exists(ctx, fleetKey).Result()
		if err == nil && exists > 0 {
			cost *= 3.0 // 3x penalty
		}
	}

	return cost
}

// FindPath finds the optimal path between origin and destination nodes using the A* algorithm.
func (g *Graph) FindPath(ctx context.Context, rdb redis.Cmdable, origin, destination types.NodeID, vehicleType types.VehicleType, useDynamic bool, fleetID string) (types.Path, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	startNode, ok := g.Nodes[origin]
	if !ok {
		return types.Path{}, fmt.Errorf("origin node %s not found", origin)
	}
	destNode, ok := g.Nodes[destination]
	if !ok {
		return types.Path{}, fmt.Errorf("destination node %s not found", destination)
	}

	gScore := make(map[types.NodeID]float64)
	for id := range g.Nodes {
		gScore[id] = math.Inf(1)
	}
	gScore[origin] = 0.0

	fScore := make(map[types.NodeID]float64)
	for id := range g.Nodes {
		fScore[id] = math.Inf(1)
	}
	hStart := HaversineDistance(startNode.Lat, startNode.Lng, destNode.Lat, destNode.Lng) / DefaultSpeed
	fScore[origin] = hStart

	type cameFromEdge struct {
		fromNode types.NodeID
		edgeID   types.EdgeID
	}
	cameFrom := make(map[types.NodeID]cameFromEdge)

	pqMap := make(map[types.NodeID]*astarNode)
	pq := &PriorityQueue{}
	heap.Init(pq)

	startItem := &astarNode{
		nodeID: origin,
		fScore: hStart,
	}
	heap.Push(pq, startItem)
	pqMap[origin] = startItem

	for pq.Len() > 0 {
		currItem := heap.Pop(pq).(*astarNode)
		currID := currItem.nodeID
		delete(pqMap, currID)

		if currID == destination {
			var edges []types.EdgeID
			totalDist := 0.0
			totalTime := 0.0

			tempID := destination
			for tempID != origin {
				cf, ok := cameFrom[tempID]
				if !ok {
					break
				}
				edges = append([]types.EdgeID{cf.edgeID}, edges...)
				edge := g.Edges[cf.edgeID]
				totalDist += edge.Distance
				totalTime += g.calculateEdgeCostLocked(ctx, rdb, edge, vehicleType, useDynamic, fleetID)
				tempID = cf.fromNode
			}

			return types.Path{
				Edges:         edges,
				TotalDistance: totalDist,
				EstimatedTime: totalTime,
			}, nil
		}

		neighbors := g.Adjacency[currID]
		for _, edge := range neighbors {
			neighborID := edge.To
			neighborNode, ok := g.Nodes[neighborID]
			if !ok {
				continue
			}

			cost := g.calculateEdgeCostLocked(ctx, rdb, edge, vehicleType, useDynamic, fleetID)
			tentativeGScore := gScore[currID] + cost

			if tentativeGScore < gScore[neighborID] {
				cameFrom[neighborID] = cameFromEdge{
					fromNode: currID,
					edgeID:   edge.ID,
				}
				gScore[neighborID] = tentativeGScore
				hVal := HaversineDistance(neighborNode.Lat, neighborNode.Lng, destNode.Lat, destNode.Lng) / DefaultSpeed
				fVal := tentativeGScore + hVal
				fScore[neighborID] = fVal

				if item, exists := pqMap[neighborID]; exists {
					item.fScore = fVal
					heap.Fix(pq, item.index)
				} else {
					newItem := &astarNode{
						nodeID: neighborID,
						fScore: fVal,
					}
					heap.Push(pq, newItem)
					pqMap[neighborID] = newItem
				}
			}
		}
	}

	return types.Path{}, fmt.Errorf("no path found from %s to %s", origin, destination)
}

// UpdateEdgeLoad changes the vehicle load count on an edge in a thread-safe manner.
func (g *Graph) UpdateEdgeLoad(edgeID types.EdgeID, delta int) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	edge, exists := g.Edges[edgeID]
	if !exists {
		return fmt.Errorf("edge %s not found", edgeID)
	}

	edge.CurrentLoad += delta
	if edge.CurrentLoad < 0 {
		edge.CurrentLoad = 0
	}
	return nil
}

// SetEdgeLoad sets the vehicle load count on an edge in a thread-safe manner.
func (g *Graph) SetEdgeLoad(edgeID types.EdgeID, load int) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	edge, exists := g.Edges[edgeID]
	if !exists {
		return fmt.Errorf("edge %s not found", edgeID)
	}

	if load < 0 {
		load = 0
	}
	edge.CurrentLoad = load
	return nil
}

// SetEdgeSpeed sets the current speed (in km/h) for an edge in a thread-safe manner.
func (g *Graph) SetEdgeSpeed(edgeID types.EdgeID, speed float64) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	_, exists := g.Edges[edgeID]
	if !exists {
		return fmt.Errorf("edge %s not found", edgeID)
	}

	if g.IoTEdgeSpeeds == nil {
		g.IoTEdgeSpeeds = make(map[types.EdgeID]float64)
	}
	g.IoTEdgeSpeeds[edgeID] = speed
	return nil
}

// GetEdgeIDs returns a list of all edge IDs in the graph in a thread-safe manner.
func (g *Graph) GetEdgeIDs() []types.EdgeID {
	g.mu.RLock()
	defer g.mu.RUnlock()
	ids := make([]types.EdgeID, 0, len(g.Edges))
	for id := range g.Edges {
		ids = append(ids, id)
	}
	return ids
}

// astarNode represents a node in the A* search tree.
type astarNode struct {
	nodeID types.NodeID
	fScore float64
	index  int
}

// PriorityQueue implements heap.Interface and holds astarNodes.
type PriorityQueue []*astarNode

func (pq PriorityQueue) Len() int           { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool { return pq[i].fScore < pq[j].fScore }
func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}
func (pq *PriorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*astarNode)
	item.index = n
	*pq = append(*pq, item)
}
func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}
