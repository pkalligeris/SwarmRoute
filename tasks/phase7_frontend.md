# Phase 7: Simulation Web Frontend Tasks

This phase covers building the interactive map interface to pitch the MVP, using Mapbox GL JS to display vehicles moving through the center of Athens in real time.

---

## UI Task 7.1: Premium Athens Mapbox Setup

### File
[index.html](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/frontend/index.html) and [style.css](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/frontend/style.css)

### Features
- Embed Mapbox GL JS script.
- Center the map on Syntagma Square (`Lat: 37.9756, Lng: 23.7348`) at a 3D pitch/zoom.
- Create a dark theme layout using premium glassmorphism styling:
  - Translucent side panel showing:
    - active vehicles count
    - average system travel time (seconds)
    - total flow points (karma) generated
    - congestion meter
  - High-performance HSL colors and sleek gradients.

---

## UI Task 7.2: Control Panel Dashboard

### File
[index.html](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/frontend/index.html)

### Features
- Create an **Adoption Rate** slider (0% to 100%).
- Add buttons to:
  - **Spawn 20 Vehicles**: civilian vehicles that go from random nodes in Athens to Syntagma.
  - **Spawn Delivery Fleet**: spawns a group of 5 delivery vans that coordinate paths.
  - **Spawn Emergency Vehicle**: spawns an ambulance that triggers a green wave.
  - **IoT Telemetry Toggle**: enables or disables IoT sensor ingestion.

---

## UI Task 7.3: Real-time Telemetry Client

### File
[app.js](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/frontend/app.js)

### Features
- Initiate WebSocket connection to `ws://localhost:8080/ws`.
- Listen for `"vehicle_positions"` messages.
- Draw vehicles on the map as colored markers based on typology:
  - Civilian (non-adopters): Gray markers.
  - Civilian (SwarmRoute adopters): Blue markers.
  - Delivery Fleets: Orange markers.
  - Emergency Vehicles: Pulsing red/white markers.
- Animate markers smoothly using delta interpolation.
