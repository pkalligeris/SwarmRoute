# Phase 1: Core Graph Engine TDD Tasks

This phase covers building the weighted directed graph representing the road network of central Athens, travel cost calculations, and A* pathfinding.

---

## TDD Task 1.1: Haversine Distance Calculation

### Test Name
`TestHaversineDistance`

### File
[graph_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/graph/graph_test.go)

### Assertions
- Given coordinates for Syntagma Square (`37.9756, 23.7348`) and Omonia Square (`37.9841, 23.7280`).
- Assert that `HaversineDistance(37.9756, 23.7348, 37.9841, 23.7280)` returns a value close to `1100.0` meters within a tolerance of `50.0` meters.

### Implementation Goals
- Define function: `HaversineDistance(lat1, lng1, lat2, lng2 float64) float64`.
- Use the standard mathematical Haversine formula with earth radius $R = 6,371,000$ meters.

---

## TDD Task 1.2: A* Static Pathfinding

### Test Name
`TestAStarStatic`

### File
[graph_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/graph/graph_test.go)

### Assertions
- Build a graph with 3 nodes (A = Syntagma, B = Panepistimio, C = Omonia) using:
  - Node A: `37.9756, 23.7348`
  - Node B: `37.9802, 23.7327`
  - Node C: `37.9841, 23.7280`
- Define edges:
  - Edge `A-B` (Distance: 550m, capacity 10)
  - Edge `B-C` (Distance: 600m, capacity 10)
  - Edge `A-C` direct detour (Distance: 2500m, capacity 10)
- Request path from A to C with `types.Civilian`, dynamic costs disabled.
- Assert that the returned path contains edges `["A-B", "B-C"]` (total distance 1150m) rather than the direct detour `["A-C"]` (distance 2500m).

### Implementation Goals
- Define `Graph` struct:
  - `Nodes map[types.NodeID]*types.Node`
  - `Edges map[types.EdgeID]*types.Edge`
  - `Adjacency map[types.NodeID][]*types.Edge`
- Implement A* search using Go's `container/heap` with a min-priority queue sorted by `fScore = gScore + h` (using `HaversineDistance / speed` as heuristic).

---

## TDD Task 1.3: Vehicle Type soft constraints (Heavy Transport)

### Test Name
`TestHeavyTransportConstraint`

### File
[graph_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/graph/graph_test.go)

### Assertions
- Construct a graph with edges:
  - Edge `A-B` (Distance: 550m, restricted to `types.Civilian` only)
  - Edge `A-C` (Distance: 600m, allowed for `types.HeavyTransport`)
  - Edge `C-B` (Distance: 600m, allowed for `types.HeavyTransport`)
- Route a `types.Civilian` vehicle from A to B: assert it takes `["A-B"]` (550m).
- Route a `types.HeavyTransport` vehicle from A to B: assert it takes `["A-C", "C-B"]` (1200m) because of a $10\times$ travel time penalty applied to the restricted `A-B` edge.

### Implementation Goals
- Implement soft constraint filtering inside `CalculateEdgeCost()`.
- If a vehicle of type `HeavyTransport` traverses an edge where `HeavyTransport` is not in its `Constraints`, apply a $10\times$ multiplier penalty to the edge's cost.

---

## TDD Task 1.4: Dynamic BPR Cost-Based Routing

### Test Name
`TestDynamicBPRRouting`

### File
[graph_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/graph/graph_test.go)

### Assertions
- Construct a graph with edges:
  - Edge `A-B` (Distance: 1000m, capacity 10, CurrentLoad: 10)
  - Edge `B-C` (Distance: 1000m, capacity 10, CurrentLoad: 10)
  - Edge `A-C` direct detour (Distance: 2100m, capacity 10, CurrentLoad: 0)
- Request path with dynamic costs enabled.
- Assert that the returned path is the direct detour `["A-C"]` because the congested path `A-B-C` has BPR-scaled travel time penalty making it slower than the detour.

### Implementation Goals
- Implement BPR cost calculation in `CalculateEdgeCost()`:
  $$\text{Travel Time} = \text{FreeFlowTime} \times \left(1 + 0.15 \times \left(\frac{\text{CurrentLoad}}{\text{MaxCapacity}}\right)^4\right)$$

---

## TDD Task 1.5: Thread-Safe Load Updates

### Test Name
`TestUpdateEdgeLoad`

### File
[graph_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/graph/graph_test.go)

### Assertions
- Call `UpdateEdgeLoad()` concurrently for the same edge from multiple goroutines.
- Assert that the resulting `CurrentLoad` is mathematically correct and does not cause a race condition.

### Implementation Goals
- Add `sync.RWMutex` to the `Graph` struct to serialize read and write access to graph edges.
- Implement `UpdateEdgeLoad(edgeID types.EdgeID, delta int) error`.
