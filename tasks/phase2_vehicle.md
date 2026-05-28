# Phase 2: Vehicle State Manager TDD Tasks

This phase covers the implementation of the Redis-backed vehicle tracker which records GPS telemetry and indices active vehicles on each road segment.

---

## TDD Task 2.1: Register Vehicle

### Test Name
`TestRegisterVehicle`

### File
[manager_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/vehicle/manager_test.go)

### Assertions
- Mock a running Redis using `miniredis`.
- Register a civilian vehicle `v1` at coordinates (`37.9756, 23.7348`) on edge `"A-B"`.
- Assert that:
  - The Redis key `vehicle:v1` contains the serialized JSON of the vehicle.
  - The Redis Set `edge:A-B:vehicles` contains the member `"v1"`.

### Implementation Goals
- Define `VehicleManager` struct:
  - `rdb redis.Cmdable`
  - `ttl time.Duration`
- Implement `RegisterVehicle(ctx context.Context, v *types.Vehicle) error`.

---

## TDD Task 2.2: Update Position & Edge Indexing

### Test Name
`TestUpdatePosition`

### File
[manager_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/vehicle/manager_test.go)

### Assertions
- Move vehicle `v1` from edge `"A-B"` to edge `"B-C"` at new coordinates (`37.9802, 23.7327`).
- Assert that:
  - The vehicle JSON reflects the new coordinates and edge.
  - `"v1"` has been removed from `edge:A-B:vehicles`.
  - `"v1"` has been added to `edge:B-C:vehicles`.

### Implementation Goals
- Implement `UpdatePosition(ctx context.Context, id types.VehicleID, lat, lng float64, newEdge types.EdgeID) error`.
- Transactionally remove vehicle ID from old edge set and add to new edge set when a transition occurs.

---

## TDD Task 2.3: Get Vehicles on Edge & Expiry Cleanup

### Test Name
`TestGetVehiclesOnEdgeWithTTL`

### File
[manager_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/vehicle/manager_test.go)

### Assertions
- Register vehicle `v1` on edge `"B-C"` with a 10-second TTL.
- Simulate the passage of 11 seconds using `miniredis.FastForward()`.
- Query `GetVehiclesOnEdge(ctx, "B-C")`.
- Assert that:
  - The returned slice of vehicles is empty.
  - The key `vehicle:v1` is deleted.
  - The set `edge:B-C:vehicles` has had `"v1"` removed (lazy self-cleaning).

### Implementation Goals
- Implement `GetVehiclesOnEdge(ctx context.Context, edgeID types.EdgeID) ([]*types.Vehicle, error)`.
- When querying a set, check if each vehicle key exists in Redis. If a key returns `redis.Nil`, perform an `SRem` to keep indices clean.
