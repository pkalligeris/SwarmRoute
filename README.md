# SwarmRoute - System-Optimal Traffic Routing

SwarmRoute is a hackathon MVP that demonstrates system-optimal routing by orchestrating traffic flow across urban networks. Unlike traditional "selfish routing" apps that send all users down the same fastest path, SwarmRoute acts as a central coordinator to distribute vehicles intelligently across multiple routes.

## Key Features

- **System-Optimal Routing**: Distributes traffic to prevent bottlenecks
- **Vehicle Type Priority**: Emergency vehicles get green wave, delivery fleets coordinate
- **IoT Sensor Integration**: Mock traffic sensors for realistic simulation
- **Karma System**: Gamification rewards users who accept longer routes
- **Real-time Visualization**: WebSocket-powered live map with 100ms updates

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design.

## Prerequisites

- Go 1.21 or higher
- Docker and Docker Compose
- Node.js (for frontend development)
- Mapbox API token (free tier: https://account.mapbox.com/)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/pkalligeris/SwarmRoute.git
cd SwarmRoute
```

### 2. Start Redis

```bash
docker-compose up -d
```

Verify Redis is running:
```bash
docker-compose ps
```

### 3. Install Go Dependencies

```bash
go mod download
```

### 4. Run Tests (TDD Approach)

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run tests for specific component
go test ./internal/graph/...
```

### 5. Run the Backend Server

```bash
go run cmd/server/main.go
```

The server will start on `http://localhost:8080`

### 6. Run the Frontend

```bash
cd frontend
python -m http.server 8081
```

Open browser to `http://localhost:8081`

## Project Structure

```
SwarmRoute/
├── cmd/
│   └── server/           # Main application entry point
├── internal/             # Private application code
│   ├── graph/           # Graph Engine (road network)
│   ├── orchestrator/    # Routing Orchestrator (core algorithm)
│   ├── vehicle/         # Vehicle State Manager
│   ├── iot/             # IoT Sensor Ingestion
│   ├── websocket/       # WebSocket Handler
│   └── karma/           # Karma System (gamification)
├── pkg/
│   └── types/           # Shared types across packages
├── test/
│   └── integration/     # Integration tests
├── frontend/            # Web UI (Mapbox + WebSocket)
├── docker-compose.yml   # Redis setup
├── go.mod               # Go dependencies
├── ARCHITECTURE.md      # System architecture documentation
├── PRD.md               # Product requirements
├── Skill.md             # TDD guidelines
└── TODO.md              # Detailed task breakdown
```

## Development Workflow (TDD)

This project follows **strict Test-Driven Development**. See [Skill.md](Skill.md) for complete TDD guidelines.

### The Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST

Every feature follows the Red-Green-Refactor cycle:

1. **RED**: Write a failing test
2. **Verify RED**: Run test, confirm it fails correctly
3. **GREEN**: Write minimal code to pass
4. **Verify GREEN**: Run test, confirm it passes
5. **REFACTOR**: Clean up while keeping tests green

### Example Workflow

```bash
# 1. Write a test (it will fail)
vim internal/graph/graph_test.go

# 2. Run the test - watch it fail
go test ./internal/graph -v

# 3. Implement minimal code
vim internal/graph/graph.go

# 4. Run test again - watch it pass
go test ./internal/graph -v

# 5. Refactor if needed, keep tests green
```

## Development Phases

See [TODO.md](TODO.md) for detailed task breakdown.

- **Phase 1**: Core Graph Engine (Week 1)
- **Phase 2**: Routing Orchestrator (Week 1-2)
- **Phase 3**: Vehicle Types & Priority (Week 2)
- **Phase 4**: Real-time WebSocket Layer (Week 2-3)
- **Phase 5**: IoT Integration (Week 3)
- **Phase 6**: Frontend Visualization (Week 3-4)

## Running the Demo

### Simulation Scenarios

The demo includes three key scenarios:

1. **Baseline (0% Adoption)**: All vehicles take the same route → bottleneck
2. **Swarm Effect (50% Adoption)**: Vehicles distributed → smooth flow
3. **Emergency Response**: Emergency vehicle gets green wave

### Control Panel

- **Adoption Slider**: Adjust percentage of SwarmRoute users (0-100%)
- **IoT Toggle**: Enable/disable sensor-based rerouting
- **Spawn Controls**: Add civilian, delivery, or emergency vehicles
- **Emergency Button**: Activate priority routing (costs 100 karma points)

## Testing

### Unit Tests

```bash
# Test specific component
go test ./internal/graph -v
go test ./internal/orchestrator -v

# Test with race detector
go test -race ./...
```

### Integration Tests

```bash
go test ./test/integration -v
```

### Coverage Report

```bash
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Configuration

Environment variables (optional):

```bash
export REDIS_URL="localhost:6379"
export SERVER_PORT="8080"
export WS_BROADCAST_INTERVAL="100ms"
export MAPBOX_TOKEN="your_token_here"
```

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps

# View Redis logs
docker-compose logs redis

# Restart Redis
docker-compose restart redis
```

### Port Already in Use

```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>
```

### Go Module Issues

```bash
# Clean module cache
go clean -modcache

# Re-download dependencies
go mod download
```

## Performance Targets

| Metric | Target |
|--------|--------|
| Route calculation | < 50ms |
| WebSocket broadcast | 100ms interval |
| Concurrent vehicles | 1000+ |
| Memory per vehicle | < 1KB |

## Contributing

This is a hackathon project. Follow TDD principles strictly:

1. Never write production code without a failing test first
2. If you didn't watch the test fail, delete the code and start over
3. Write minimal code to pass tests
4. Refactor only when tests are green

## License

MIT License - see LICENSE file

## References

- [Product Requirements (PRD.md)](PRD.md)
- [System Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)
- [TDD Guidelines (Skill.md)](Skill.md)
- [Task Breakdown (TODO.md)](TODO.md)

## Hackathon Pitch

**Problem**: Navigation apps cause secondary bottlenecks by sending everyone down the same "fastest" route.

**Solution**: SwarmRoute orchestrates traffic like a conductor, distributing vehicles across multiple routes to maintain system-wide flow.

**Impact**: Even with 50% adoption, the entire network moves faster. Emergency vehicles get guaranteed green waves. Delivery fleets coordinate to avoid overlap.

**Business Model**: Free for consumers (B2C), API licensing for logistics companies and smart cities (B2B).
