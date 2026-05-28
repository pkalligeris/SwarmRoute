# Phase 3: Karma System TDD Tasks

This phase covers the implementation of the gamified Karma System which awards Flow Points for drivers accepting longer detours, and handles spending points to request personal routing priority.

---

## TDD Task 3.1: Flow Points Calculation

### Test Name
`TestCalculateFlowPoints`

### File
[karma_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/karma/karma_test.go)

### Assertions
- Mock two routes:
  - Route A (Shortest static path): Estimated Time = 600 seconds (10 minutes)
  - Route B (Assigned detour path): Estimated Time = 720 seconds (12 minutes)
- Calculate points: `points := CalculateFlowPoints(RouteB, RouteA)`
- Assert that `points` equals `20` (+10 points per extra minute accepted).

### Implementation Goals
- Define helper: `CalculateFlowPoints(acceptedRoute, optimalRoute types.Path) int`.
- Formula:
  $$\text{Points} = \text{max}\left(0, \text{round}\left(\frac{\text{AcceptedTime} - \text{OptimalTime}}{60}\right) \times 10\right)$$

---

## TDD Task 3.2: Award Flow Points

### Test Name
`TestAwardFlowPoints`

### File
[karma_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/karma/karma_test.go)

### Assertions
- Award `50` points to vehicle `v1`.
- Assert that the Redis key `karma:v1` has a value of `50`.
- Award another `30` points to vehicle `v1`.
- Assert that the key `karma:v1` has a value of `80`.

### Implementation Goals
- Define `KarmaManager` struct:
  - `rdb redis.Cmdable`
- Implement `AwardFlowPoints(ctx context.Context, id types.VehicleID, points int) error`.

---

## TDD Task 3.3: Spend Flow Points (Priority Verification)

### Test Name
`TestSpendFlowPoints`

### File
[karma_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/karma/karma_test.go)

### Assertions
- Given a vehicle `v1` with `80` flow points:
  - Attempt to spend `100` points. Assert it returns `false` (insufficient points) and balance remains `80`.
- Award `50` points (balance = `130`):
  - Attempt to spend `100` points. Assert it returns `true` (success) and the balance is reduced to `30`.

### Implementation Goals
- Implement `SpendFlowPoints(ctx context.Context, id types.VehicleID, points int) (bool, error)`.
- Use a Redis transaction (or Lua script / watch) to verify the balance is sufficient before deducting, ensuring atomic execution.
