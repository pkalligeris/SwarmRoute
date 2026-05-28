# Phase 4: Routing Orchestrator TDD Tasks

This phase covers building the central Orchestrator that integrates Graph calculations, Redis state tracking, and Karma logic to balance network loads.

---

## TDD Task 4.1: Request Route (Selfish vs Swarm Routing)

### Test Name
`TestRequestRouteSelfishVsSwarm`

### File
[orchestrator_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/orchestrator/orchestrator_test.go)

### Assertions
- Mock the Graph, Vehicle Manager, and Karma Manager.
- Set up a highly congested path `A-B-C` (100% capacity) and an empty detour `A-C`.
- Request a route with `Emergency: false`.
- Case 1: Driver is **selfish** (representing 0% adoption). The request bypasses dynamic BPR costs and receives the congested `A-B-C` path.
- Case 2: Driver is **swarm** (representing 100% adoption). The request evaluates dynamic BPR costs and receives the detour `A-C` path.

### Implementation Goals
- Define `Orchestrator` struct:
  - `graph *graph.Graph`
  - `vehicles *vehicle.VehicleManager`
  - `karma *karma.KarmaManager`
- Implement `RequestRoute(ctx context.Context, req types.RouteRequest) (types.RouteResponse, error)`.

---

## TDD Task 4.2: Emergency Priority & Green Wave Restrictions

### Test Name
`TestRequestRouteEmergency`

### File
[orchestrator_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/orchestrator/orchestrator_test.go)

### Assertions
- Request a route for an emergency vehicle `v1` from Syntagma to Omonia.
- Assert that:
  - The path edges are calculated.
  - The edges on the emergency path are marked in Redis as "restricted/emergency" with an expiration TTL (e.g., 2 minutes).
- Request a subsequent civilian vehicle route.
- Assert that the civilian route bypasses those emergency edges, even if they are the shortest physical path.

### Implementation Goals
- When an emergency vehicle is routed, store the path edge IDs in Redis with a prefix `emergency_restricted:{edge_id}`.
- In `CalculateEdgeCost()`, if an edge is marked as restricted by an active emergency wave, add a massive travel cost penalty ($100\times$) for civilian vehicles.

---

## TDD Task 4.3: Delivery Fleet Dispersion (Intra-Fleet Penalty)

### Test Name
`TestRequestRouteFleet`

### File
[orchestrator_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/orchestrator/orchestrator_test.go)

### Assertions
- Spawn two delivery vehicles of the same fleet (`fleet_a`): `van1` and `van2` from Syntagma to Omonia.
- Request a route for `van1`. It should receive the shortest path.
- Request a route for `van2`. It should receive a different path (detour) to avoid overlapping the same streets.

### Implementation Goals
- Enforce fleet dispersion: when a fleet vehicle receives a path, store the planned path edges in Redis under a fleet prefix `fleet:{fleet_id}:edges` with a short TTL (e.g., 5 minutes).
- When another vehicle of the same fleet requests a route, apply a temporary cost penalty (e.g. $3\times$) to those active edges.
