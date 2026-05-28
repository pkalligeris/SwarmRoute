# Phase 5: IoT Sensor Ingestion TDD Tasks

This phase covers simulating real-world IoT traffic sensors (cameras, induction loops, radars) that override graph edge loads when congestion is detected.

---

## TDD Task 5.1: Ingest IoT Sensor Reading

### Test Name
`TestIngestReading`

### File
[sensor_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/iot/sensor_test.go)

### Assertions
- Create a sensor associated with edge `"A-B"` (which has `MaxCapacity: 10`, `CurrentLoad: 0`).
- Ingest a reading reporting: `VehicleCount: 8`, `AvgSpeed: 10.0` km/h.
- Assert that:
  - The edge's `CurrentLoad` is updated to reflect the count reported by the sensor.
  - The calculated travel cost of edge `"A-B"` increases according to the sensor-derived density.

### Implementation Goals
- Define `SensorManager` struct:
  - `graph *graph.Graph`
- Implement `IngestReading(ctx context.Context, reading types.SensorReading) error`.
- Map the sensor ID to its associated edge ID, and update the graph edge state with the reported vehicle count.
- If speed is below a threshold (e.g. 15 km/h), apply a speed penalty multiplier.
