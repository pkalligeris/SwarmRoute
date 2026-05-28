# SwarmRoute - System Architecture

## Overview
SwarmRoute is a system-optimal routing platform that orchestrates traffic flow across urban networks. This document defines the technical architecture for the hackathon MVP.

## Architecture Principles
- **Test-Driven Development**: All components follow strict TDD (see Skill.md)
- **Real-time Processing**: Sub-100ms latency for routing decisions
- **Scalability**: Handle thousands of concurrent vehicle connections
- **Separation of Concerns**: Clear boundaries between routing, simulation, and presentation

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Mapbox GL JS  │  │  WebSocket   │  │  Control Panel  │ │
│  │  Visualization │  │    Client    │  │   (Sliders)     │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                    WebSocket Connection
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Backend Layer (Go)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              WebSocket Handler                          │ │
│  │  - Connection management                                │ │
│  │  - Real-time telemetry broadcast                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                              │                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Routing Orchestrator (Core Engine)              │ │
│  │  - System-optimal route calculation                     │ │
│  │  - Vehicle distribution algorithm                       │ │
│  │  - Priority management (Emergency/Fleet/Civilian)       │ │
│  └────────────────────────────────────────────────────────┘ │
│                              │                               │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐ │
│  │ Graph Engine │  │  Vehicle State  │  │  IoT Sensor   │ │
│  │  - Road net  │  │    Manager      │  │   Ingestion   │ │
│  │  - Capacity  │  │  - Positions    │  │  - Mock data  │ │
│  │  - Costs     │  │  - Types        │  │  - Traffic    │ │
│  └──────────────┘  └─────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer (Redis)                      │
│  - Vehicle positions (lat/lng, timestamp)                   │
│  - Road segment current load                                │
│  - Flow points (karma system)                               │
│  - IoT sensor readings                                      │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Graph Engine
**Responsibility**: Represent road network as a weighted directed graph

**Key Types**:
```go
type Node struct {
    ID       string
    Lat      float64
    Lng      float64
}

type Edge struct {
    ID           string
    From         NodeID
    To           NodeID
    Distance     float64
    MaxCapacity  int
    CurrentLoad  int
    Constraints  []VehicleType
}

type Graph struct {
    Nodes map[string]*Node
    Edges map[string]*Edge
}
```

**Key Operations**:
- `CalculateEdgeCost(edge Edge) float64`: Dynamic cost based on current load
- `FindPath(from, to NodeID, vehicleType VehicleType) Path`: Pathfinding with constraints
- `UpdateEdgeLoad(edgeID string, delta int)`: Real-time capacity tracking

**Testing Strategy**:
- Test edge cost increases with load
- Test path finding respects vehicle constraints
- Test capacity updates are atomic

### 2. Routing Orchestrator
**Responsibility**: System-optimal route distribution across all vehicles

**Key Types**:
```go
type Vehicle struct {
    ID           string
    Type         VehicleType
    Origin       NodeID
    Destination  NodeID
    CurrentEdge  EdgeID
    Priority     int
    FlowPoints   int
}

type VehicleType int
const (
    Civilian VehicleType = iota
    Delivery
    Emergency
    HeavyTransport
)

type RouteRequest struct {
    VehicleID   string
    Origin      NodeID
    Destination NodeID
    Type        VehicleType
    Emergency   bool
}

type RouteResponse struct {
    Path        []EdgeID
    EstimatedTime float64
    FlowPointsEarned int
}
```

**Key Operations**:
- `RequestRoute(req RouteRequest) RouteResponse`: Main routing logic
- `DistributeTraffic(requests []RouteRequest) []RouteResponse`: Batch optimization
- `CreateGreenWave(emergencyVehicle Vehicle)`: Clear path for emergency
- `OptimizeFleet(fleet []Vehicle) []RouteResponse`: Multi-vehicle coordination

**Algorithm**:
1. Calculate all possible paths (A* with dynamic edge costs)
2. For civilian vehicles: distribute across paths to balance load
3. For emergency: force reroute of blocking vehicles
4. For fleets: solve as multi-agent optimization (prevent overlap)
5. Award flow points for accepting longer routes

**Testing Strategy**:
- Test single vehicle gets shortest path when network empty
- Test multiple vehicles distributed across alternatives
- Test emergency vehicle clears path
- Test fleet vehicles don't overlap zones

### 3. Vehicle State Manager
**Responsibility**: Track real-time position and state of all vehicles

**Key Operations**:
- `UpdatePosition(vehicleID string, lat, lng float64)`: GPS telemetry
- `GetVehiclesOnEdge(edgeID string) []Vehicle`: Query by location
- `RegisterVehicle(v Vehicle)`: Add to simulation
- `RemoveVehicle(vehicleID string)`: Complete journey

**Storage**: Redis with TTL for automatic cleanup

**Testing Strategy**:
- Test position updates reflected in queries
- Test vehicles expire after TTL
- Test concurrent updates don't corrupt state

### 4. IoT Sensor Ingestion
**Responsibility**: Simulate real-world traffic sensors feeding data

**Key Types**:
```go
type Sensor struct {
    ID       string
    Location NodeID
    Type     SensorType
}

type SensorReading struct {
    SensorID  string
    Timestamp time.Time
    VehicleCount int
    AvgSpeed  float64
}
```

**Key Operations**:
- `GenerateMockReading(sensorID string) SensorReading`: Simulation
- `IngestReading(reading SensorReading)`: Update graph edge costs
- `DetectCongestion(edgeID string) bool`: Trigger rerouting

**Testing Strategy**:
- Test high vehicle count increases edge cost
- Test low speed increases edge cost
- Test congestion detection triggers reroute

### 5. WebSocket Handler
**Responsibility**: Real-time bidirectional communication with frontend

**Key Operations**:
- `HandleConnection(conn *websocket.Conn)`: New client
- `BroadcastVehiclePositions()`: Push updates every 100ms
- `ReceiveRouteRequest(msg RouteRequestMessage)`: Handle client requests

**Message Protocol**:
```json
// Client -> Server
{
  "type": "route_request",
  "vehicle_id": "v123",
  "origin": "n1",
  "destination": "n10",
  "vehicle_type": "civilian",
  "emergency": false
}

// Server -> Client
{
  "type": "route_response",
  "vehicle_id": "v123",
  "path": ["e1", "e5", "e9"],
  "estimated_time": 15.5
}

// Server -> All Clients (broadcast)
{
  "type": "vehicle_positions",
  "vehicles": [
    {"id": "v123", "lat": 37.9838, "lng": 23.7275, "type": "civilian"},
    {"id": "v124", "lat": 37.9840, "lng": 23.7280, "type": "emergency"}
  ]
}
```

**Testing Strategy**:
- Test connection accepts valid WebSocket upgrade
- Test broadcast reaches all connected clients
- Test invalid messages rejected

### 6. Karma System
**Responsibility**: Gamification and fairness mechanism

**Key Operations**:
- `AwardFlowPoints(vehicleID string, points int)`: Reward cooperation
- `SpendFlowPoints(vehicleID string, points int) bool`: Use for emergency
- `CalculateFlowPoints(acceptedRoute, optimalRoute Path) int`: Scoring

**Rules**:
- +10 points per minute of extra time accepted
- Emergency button costs 100 points
- Points expire after 30 days

**Testing Strategy**:
- Test points awarded for longer routes
- Test emergency button requires sufficient points
- Test points deducted on emergency use

## Data Flow

### Route Request Flow
```
1. Frontend: User clicks destination
2. WebSocket: Send route_request message
3. Orchestrator: Receive request
4. Graph Engine: Calculate possible paths with current costs
5. Orchestrator: Select path that balances system load
6. Vehicle State: Update vehicle's assigned path
7. Redis: Store path and update edge loads
8. WebSocket: Send route_response to client
9. Frontend: Display route on map
```

### Real-time Update Flow
```
1. Vehicle State: Positions updated (GPS simulation)
2. Graph Engine: Recalculate edge loads
3. IoT Ingestion: Process sensor readings
4. Orchestrator: Detect congestion, trigger reroutes if needed
5. WebSocket: Broadcast vehicle_positions (100ms interval)
6. Frontend: Animate vehicles on map
```

### Emergency Flow
```
1. Frontend: Emergency button pressed
2. Karma System: Check flow points >= 100
3. Orchestrator: CreateGreenWave(emergencyVehicle)
4. Graph Engine: Find all vehicles on emergency path
5. Orchestrator: Force reroute blocking vehicles
6. WebSocket: Broadcast priority updates
7. Frontend: Show emergency vehicle with special icon
```

## Technology Stack

### Backend
- **Language**: Go 1.21+
- **WebSocket**: gorilla/websocket
- **Routing Algorithm**: Custom A* with dynamic costs
- **Concurrency**: Goroutines for each vehicle simulation
- **Testing**: Go standard testing package (TDD)

### Data Layer
- **Cache**: Redis 7.0+
- **Key Patterns**:
  - `vehicle:{id}` → Vehicle state (JSON)
  - `edge:{id}:load` → Current vehicle count (int)
  - `karma:{vehicle_id}` → Flow points (int)
  - `sensor:{id}:latest` → Last reading (JSON)

### Frontend
- **Map**: Mapbox GL JS v2.15+
- **WebSocket**: Native WebSocket API
- **UI**: Vanilla JavaScript (minimal dependencies for hackathon)

## Performance Requirements

| Metric | Target | Rationale |
|--------|--------|-----------|
| Route calculation | < 50ms | Real-time responsiveness |
| WebSocket broadcast | 100ms interval | Smooth animation |
| Concurrent vehicles | 1000+ | Realistic city simulation |
| Graph size | 100 nodes, 300 edges | Sufficient for demo |
| Memory per vehicle | < 1KB | Scale to thousands |

## Testing Strategy (TDD)

### Unit Tests (Per Component)
- Graph Engine: Path finding, cost calculation, capacity
- Orchestrator: Route distribution, emergency handling, fleet optimization
- Vehicle State: Position updates, queries, TTL
- IoT Ingestion: Reading processing, congestion detection
- Karma System: Points calculation, spending validation

### Integration Tests
- Route request → response flow
- Emergency vehicle clears path
- Fleet coordination prevents overlap
- IoT sensor triggers reroute

### Simulation Tests
- 100 vehicles, 0% adoption → all take same route (bottleneck)
- 100 vehicles, 50% adoption → distributed across alternatives
- Emergency vehicle → civilian vehicles reroute
- Delivery fleet → no zone overlap

## Development Phases

### Phase 1: Core Graph (Week 1)
- [ ] Implement Graph, Node, Edge types
- [ ] Write tests for graph operations
- [ ] Implement basic A* pathfinding
- [ ] Test path finding with static costs

### Phase 2: Routing Orchestrator (Week 1-2)
- [ ] Implement dynamic cost calculation
- [ ] Write tests for load-based routing
- [ ] Implement traffic distribution algorithm
- [ ] Test multiple vehicles get different paths

### Phase 3: Vehicle Types (Week 2)
- [ ] Implement vehicle type constraints
- [ ] Write tests for emergency priority
- [ ] Implement green wave algorithm
- [ ] Test fleet coordination

### Phase 4: Real-time Layer (Week 2-3)
- [ ] Implement WebSocket handler
- [ ] Write tests for message protocol
- [ ] Implement position broadcast
- [ ] Test concurrent connections

### Phase 5: IoT Integration (Week 3)
- [ ] Implement mock sensor generator
- [ ] Write tests for sensor ingestion
- [ ] Implement congestion detection
- [ ] Test sensor-triggered rerouting

### Phase 6: Frontend (Week 3-4)
- [ ] Mapbox integration
- [ ] WebSocket client
- [ ] Vehicle animation
- [ ] Control panel (sliders, buttons)

## Deployment (Hackathon Demo)

### Local Setup
```bash
# Backend
cd backend
go run main.go

# Redis
docker run -p 6379:6379 redis:7-alpine

# Frontend
cd frontend
python -m http.server 8080
```

### Demo Environment
- Single machine (laptop)
- Backend: localhost:8080
- Frontend: localhost:8081
- Redis: localhost:6379

## Security Considerations (Post-Hackathon)
- WebSocket authentication
- Rate limiting on route requests
- Input validation on coordinates
- Redis password protection

## Future Enhancements (Beyond MVP)
- Machine learning for traffic prediction
- Real IoT sensor integration (city APIs)
- Mobile app (React Native)
- Historical data analytics
- Multi-city support
- Weather impact on routing

## References
- PRD.md: Product requirements and business model
- Skill.md: TDD methodology and testing standards
- Go documentation: https://go.dev/doc/
- Mapbox GL JS: https://docs.mapbox.com/mapbox-gl-js/
- Redis: https://redis.io/docs/
