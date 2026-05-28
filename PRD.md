PRODUCT REQUIREMENTS DOCUMENT (PRD)
Project: SwarmRoute (System-Optimal Routing & Smart City Platform)

1. EXECUTIVE SUMMARY & PRODUCT VISION
Current navigation applications rely on "Selfish Routing," sending all users down the same "fastest" path, inevitably causing secondary bottlenecks (the "Waze Effect"). SwarmRoute is a system-optimal routing simulation designed for a hackathon MVP. It acts as an orchestrator, distributing traffic intelligently across multiple routes to maintain flow equilibrium. 
Value Proposition: Even if only a fraction of drivers use SwarmRoute, the overall network congestion decreases. By integrating with Smart City infrastructure, it saves time, reduces emissions, and prioritizes critical city services.

2. TARGET AUDIENCE & BUSINESS MODEL
* End-Users (Free Tier): Everyday drivers who receive free navigation in exchange for contributing location data and following balanced routing.
* B2B Customers (Monetization Strategy):
  - Logistics & Delivery Fleets: API access to coordinate hundreds of delivery vehicles simultaneously (Fleet Routing), ensuring they do not bottleneck each other.
  - Smart Cities / Municipalities: Data licensing for urban planning, providing real-time heatmaps, and integrating with city IoT infrastructure for dynamic traffic management.
  - Emergency Services: Guaranteed "green wave" routing for critical response vehicles.

3. CORE FEATURES (HACKATHON MVP SCOPE)
3.1. System-Optimal Routing Engine
Calculates route costs based on real-time vehicle density on each edge of the graph, dynamically distributing users to prevent any single road from reaching critical capacity.

3.2. IoT Sensor Integration (Real-time Traffic Data)
To solve the "cold start" problem, the system ingests data from mock city IoT sensors (e.g., traffic cameras, induction loops, speed radars). This allows the SwarmRoute algorithm to reroute traffic dynamically *before* vehicles even reach a newly congested area.

3.3. Vehicle Typology & Constraint Routing
The algorithm handles different vehicle classes with specific constraints and priorities:
- Emergency Vehicles (Priority 0): Absolute priority. The system creates a "Green Wave" by forcing surrounding civilian traffic to pull over or reroute out of the way.
- Delivery Fleets (Fleet Routing): Calculates optimal multi-stop routes for an entire fleet simultaneously, preventing company vans from crowding the same zones.
- Heavy Transportation/Buses: Treated as predictable moving obstacles or constrained to specific wide-lane routes (Weight/Size limits).

3.4. Adoption Rate Simulation (Noise Traffic Handling)
Incorporates "Defectors" or non-app users. An interactive slider (0% to 100%) demonstrates that SwarmRoute intelligently routes app users *around* the noise traffic, benefiting the whole network.

3.5. Civic Gamification (The Karma System)
Users who accept slightly longer routes for the greater good earn Flow Points. These points can be spent to activate personal priority routing in times of need.

4. TECHNICAL ARCHITECTURE
* Backend (The Orchestrator):
  - Go (Golang): Handles high-concurrency WebSocket connections and runs the swarm routing algorithm.
  - Redis: In-memory datastore for lightning-fast state management of vehicle coordinates.
  - Mock IoT Generator: A script simulating data streams from city infrastructure.

* Frontend (The Simulation):
  - HTML5/JS & Mapbox GL JS: High-performance rendering of the map graph and different vehicle typologies (differentiated by colors/shapes).
  - WebSockets: Real-time telemetry streaming (100ms updates) from backend to frontend.

5. HACKATHON PITCH & DEMO FLOW
1. The Baseline (0% Adoption): Show all vehicles taking the main road, causing a bottleneck.
2. The Swarm Effect (50% Adoption): Move the slider to 50%. The algorithm intelligently diverts app users to alternative routes, clearing the main road.
3. IoT Integration: Toggle "IoT Sensors On". Watch the system preemptively reroute traffic based on sensor pulses rather than waiting for cars to hit traffic.
4. Fleet & Emergency Dynamics: Spawn a delivery fleet and an emergency vehicle (ambulance). Visually demonstrate the swarm recalculating to give the ambulance an open corridor, while the delivery fleet efficiently covers multiple nodes without overlapping.