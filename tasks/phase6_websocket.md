# Phase 6: WebSocket Handler & Server Integration TDD Tasks

This phase covers setting up real-time bidirectional communication with the web dashboard, handling client routing requests, and broadcasting telemetry.

---

## TDD Task 6.1: WebSocket Connection Upgrade

### Test Name
`TestWebSocketUpgrade`

### File
[websocket_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/websocket/websocket_test.go)

### Assertions
- Start a mock HTTP test server.
- Connect a WebSocket client to `/ws`.
- Assert that the connection upgrades successfully and is registered in the handler's active client connection list.

### Implementation Goals
- Define `WSHandler` struct:
  - `upgrader websocket.Upgrader`
  - `clients map[*websocket.Conn]bool`
  - `orchestrator *orchestrator.Orchestrator`
- Implement `HandleConnection(w http.ResponseWriter, r *http.Request)`.

---

## TDD Task 6.2: Telemetry Broadcasting (100ms updates)

### Test Name
`TestTelemetryBroadcast`

### File
[websocket_test.go](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/internal/websocket/websocket_test.go)

### Assertions
- Connect a client to `/ws`.
- Spawn a vehicle in the Vehicle Manager.
- Run the broadcast cycle.
- Read message from the client.
- Assert that the client receives a JSON message of type `"vehicle_positions"` containing the vehicle's coordinates.

### Implementation Goals
- Implement a loop in `WSHandler` that queries the Vehicle Manager for all active vehicles, maps them to `types.VehiclePosition`, and broadcasts them to all connected clients every 100ms.
