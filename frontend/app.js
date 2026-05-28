// Athens Node Coordinates (Mapbox format: [Lng, Lat])
const NODES = {
    "A": { id: "A", name: "Syntagma", coords: [23.7348, 37.9756] },
    "B": { id: "B", name: "Omonia", coords: [23.7280, 37.9841] },
    "C": { id: "C", name: "Monastiraki", coords: [23.7257, 37.9761] },
    "D": { id: "D", name: "Panepistimio", coords: [23.7327, 37.9802] },
    "E": { id: "E", name: "Kolonaki", coords: [23.7431, 37.9777] },
    "F": { id: "F", name: "Evangelismos", coords: [23.7481, 37.9760] },
    "G": { id: "G", name: "Plaka", coords: [23.7300, 37.9730] },
    "H": { id: "H", name: "Kerameikos", coords: [23.7115, 37.9785] },
    "I": { id: "I", name: "Thissio/Acropolis", coords: [23.7214, 37.9708] },
    "J": { id: "J", name: "Petralona", coords: [23.7180, 37.9680] }
};

// Athens Street Definitions (matching backend edges)
const EDGES = [
    { id: "A-D", from: "A", to: "D", cap: 15 },
    { id: "D-A", from: "D", to: "A", cap: 15 },
    { id: "D-B", from: "D", to: "B", cap: 15 },
    { id: "B-D", from: "B", to: "D", cap: 15 },
    { id: "B-C", from: "B", to: "C", cap: 12 },
    { id: "C-B", from: "C", to: "B", cap: 12 },
    { id: "A-C", from: "A", to: "C", cap: 10 },
    { id: "C-A", from: "C", to: "A", cap: 10 },
    { id: "A-G", from: "A", to: "G", cap: 8 },
    { id: "G-A", from: "G", to: "A", cap: 8 },
    { id: "G-I", from: "G", to: "I", cap: 8 },
    { id: "I-G", from: "I", to: "G", cap: 8 },
    { id: "I-C", from: "I", to: "C", cap: 10 },
    { id: "C-I", from: "C", to: "I", cap: 10 },
    { id: "C-H", from: "C", to: "H", cap: 15 },
    { id: "H-C", from: "H", to: "C", cap: 15 },
    { id: "B-H", from: "B", to: "H", cap: 20 },
    { id: "H-B", from: "H", to: "B", cap: 20 },
    { id: "A-E", from: "A", to: "E", cap: 10 },
    { id: "E-A", From: "E", to: "A", cap: 10 },
    { id: "E-F", from: "E", to: "F", cap: 10 },
    { id: "F-E", from: "F", to: "E", cap: 10 },
    { id: "A-F", from: "A", to: "F", cap: 15 },
    { id: "F-A", from: "F", to: "A", cap: 15 },
    { id: "I-J", from: "I", to: "J", cap: 10 },
    { id: "J-I", from: "J", to: "I", cap: 10 },
    { id: "J-H", from: "J", to: "H", cap: 10 },
    { id: "H-J", from: "H", to: "J", cap: 10 }
];

// App State
let map = null;
let socket = null;
let markers = {}; // vehicle_id -> mapbox marker
let localVehicles = {}; // vehicle_id -> vehicle simulation state
let currentEdgeLoads = {}; // edge_id -> vehicle count
let mapboxToken = localStorage.getItem("mapbox_token") || "";
let totalKarma = 0;
let isUserNavigating = false;
let lastSpokenInstruction = "";

// Street name mapping dictionary for turn-by-turn guidance
const STREET_NAMES = {
    "A-D": "Panepistimiou St",
    "D-A": "Panepistimiou St",
    "D-B": "Aiolou St",
    "B-D": "Aiolou St",
    "B-C": "Athinas St",
    "C-B": "Athinas St",
    "A-C": "Ermou St",
    "C-A": "Ermou St",
    "A-G": "Filellinon St",
    "G-A": "Filellinon St",
    "G-I": "Dionysiou Areopagitou St",
    "I-G": "Dionysiou Areopagitou St",
    "I-C": "Apostolou Pavlou St",
    "C-I": "Apostolou Pavlou St",
    "C-H": "Ermou St (West)",
    "H-C": "Ermou St (West)",
    "B-H": "Pireos St",
    "H-B": "Pireos St",
    "A-E": "Vasilissis Sofias Ave",
    "E-A": "Vasilissis Sofias Ave",
    "E-F": "Koumpari St",
    "F-E": "Koumpari St",
    "A-F": "Vasilissis Sofias Ave (East)",
    "F-A": "Vasilissis Sofias Ave (East)",
    "I-J": "Akamantos St",
    "J-I": "Akamantos St",
    "J-H": "Thessalonikis St",
    "H-J": "Thessalonikis St"
};

// UI Elements
const adoptionSlider = document.getElementById("adoption-rate");
const adoptionVal = document.getElementById("adoption-rate-val");
const iotToggle = document.getElementById("iot-toggle");
const btnSpawnCivilian = document.getElementById("btn-spawn-civilian");
const btnSpawnFleet = document.getElementById("btn-spawn-fleet");
const btnSpawnEmergency = document.getElementById("btn-spawn-emergency");
const btnClearSim = document.getElementById("btn-clear-simulation");

const statActiveCount = document.getElementById("stat-active-count");
const statAvgTime = document.getElementById("stat-avg-time");
const statCongestionPct = document.getElementById("stat-congestion-pct");
const statCongestionFill = document.getElementById("stat-congestion-fill");
const statFlowPoints = document.getElementById("stat-flow-points");

const tokenInput = document.getElementById("mapbox-token");
const btnSaveToken = document.getElementById("btn-save-token");
const modalToken = document.getElementById("modal-token-required");
const modalTokenInput = document.getElementById("modal-token-input");
const btnModalSave = document.getElementById("btn-modal-save");

const btnStartNav = document.getElementById("btn-start-nav");
const btnStopNav = document.getElementById("btn-stop-nav");
const navOrigin = document.getElementById("nav-origin");
const navDest = document.getElementById("nav-destination");
const navSelfish = document.getElementById("nav-selfish");
const navEmergency = document.getElementById("nav-emergency");

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
    if (mapboxToken) {
        tokenInput.value = mapboxToken;
        initMap();
    } else {
        modalToken.classList.remove("hidden");
    }

    setupEventListeners();
    connectWebSocket();
    startSimulationLoop();
});

function setupEventListeners() {
    // Save token actions
    btnSaveToken.addEventListener("click", () => {
        const tok = tokenInput.value.trim();
        if (tok) {
            localStorage.setItem("mapbox_token", tok);
            location.reload();
        }
    });

    btnModalSave.addEventListener("click", () => {
        const tok = modalTokenInput.value.trim();
        if (tok) {
            localStorage.setItem("mapbox_token", tok);
            modalToken.classList.add("hidden");
            location.reload();
        }
    });

    // Slider listener
    adoptionSlider.addEventListener("input", (e) => {
        adoptionVal.textContent = e.target.value + "%";
    });

    // Spawn triggers
    btnSpawnCivilian.addEventListener("click", () => spawnCivilian());
    btnSpawnFleet.addEventListener("click", () => spawnFleet());
    btnSpawnEmergency.addEventListener("click", () => spawnEmergency());
    btnClearSim.addEventListener("click", () => clearSimulation());

    // Navigation triggers
    if (btnStartNav) {
        btnStartNav.addEventListener("click", () => {
            const origin = navOrigin.value;
            const dest = navDest.value;
            if (origin === dest) {
                alert("Start intersection and destination must be different!");
                return;
            }
            const isSelfish = navSelfish.checked;
            const isEmergency = navEmergency.checked;
            startUserNavigation(origin, dest, isSelfish, isEmergency);
        });
    }

    if (btnStopNav) {
        btnStopNav.addEventListener("click", () => {
            stopUserNavigation();
        });
    }
}

// Mapbox Setup
function initMap() {
    mapboxgl.accessToken = mapboxToken;
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [23.7310, 37.9760], // Center of Athens
        zoom: 14.2,
        pitch: 50,
        bearing: -10,
        antialias: true
    });

    map.on('load', () => {
        // Add 3D building layers for visual aesthetics
        const layers = map.getStyle().layers;
        const labelLayerId = layers.find(
            (layer) => layer.type === 'symbol' && layer.layout['text-field']
        ).id;

        map.addLayer(
            {
                'id': 'add-3d-buildings',
                'source': 'composite',
                'source-layer': 'building',
                'filter': ['==', 'extrude', 'true'],
                'type': 'fill-extrusion',
                'minzoom': 13,
                'paint': {
                    'fill-extrusion-color': '#1f2937',
                    'fill-extrusion-height': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'height']
                    ],
                    'fill-extrusion-base': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'min_height']
                    ],
                    'fill-extrusion-opacity': 0.6
                }
            },
            labelLayerId
        );

        drawStreetNetwork();
    });
}

// Draw Athens Graph Edges
function drawStreetNetwork() {
    const features = EDGES.map(edge => {
        const fromNode = NODES[edge.from];
        const toNode = NODES[edge.to];
        return {
            "type": "Feature",
            "properties": { "id": edge.id, "load": 0 },
            "geometry": {
                "type": "LineString",
                "coordinates": [fromNode.coords, toNode.coords]
            }
        };
    });

    map.addSource('streets', {
        "type": "geojson",
        "data": {
            "type": "FeatureCollection",
            "features": features
        }
    });

    map.addLayer({
        "id": "street-lines",
        "type": "line",
        "source": "streets",
        "layout": {
            "line-join": "round",
            "line-cap": "round"
        },
        "paint": {
            "line-color": [
                "interpolate",
                ["linear"],
                ["get", "load"],
                0, "#10b981", // Green (free flow)
                3, "#f59e0b", // Orange (moderate)
                8, "#ef4444"  // Red (congested)
            ],
            "line-width": 4,
            "line-opacity": 0.75
        }
    });

    // Add Nodes Glow Circles
    const nodeFeatures = Object.values(NODES).map(node => ({
        "type": "Feature",
        "properties": { "name": node.name },
        "geometry": {
            "type": "Point",
            "coordinates": node.coords
        }
    }));

    map.addSource('nodes', {
        "type": "geojson",
        "data": {
            "type": "FeatureCollection",
            "features": nodeFeatures
        }
    });

    map.addLayer({
        "id": "node-points",
        "type": "circle",
        "source": "nodes",
        "paint": {
            "circle-radius": 5,
            "circle-color": "#00d2ff",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.8
        }
    });
}

// WebSocket Connection
function connectWebSocket() {
    socket = new WebSocket("ws://localhost:8080/ws");

    socket.onopen = () => {
        console.log("Connected to SwarmRoute WebSocket Server");
    };

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleSocketMessage(msg);
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed. Retrying in 3 seconds...");
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };
}

function handleSocketMessage(msg) {
    if (msg.type === "vehicle_positions") {
        updateVehicleMarkers(msg.payload);
    } else if (msg.type === "route_response") {
        handleRouteResponse(msg.payload);
    }
}

// Draw/Update Markers
function updateVehicleMarkers(positions) {
    // Keep track of active IDs
    const activeIds = new Set();
    let civilianCount = 0;
    let fleetCount = 0;
    let emergencyCount = 0;

    positions.forEach(pos => {
        activeIds.add(pos.id);
        
        let marker = markers[pos.id];
        if (!marker) {
            // Create DOM element for marker
            const el = document.createElement('div');
            el.className = 'vehicle-marker';
            
            // Set styles based on vehicle types
            if (pos.id === "user_nav_vehicle") {
                el.classList.add('user-marker');
                el.innerHTML = '<i class="fa-solid fa-location-arrow"></i>';
            } else if (pos.type === 2) { // Emergency
                el.classList.add('emergency-marker');
                el.innerHTML = '<i class="fa-solid fa-truck-medical"></i>';
                emergencyCount++;
            } else if (pos.type === 1) { // Delivery
                el.classList.add('fleet-marker');
                el.innerHTML = '<i class="fa-solid fa-box"></i>';
                fleetCount++;
            } else { // Civilian
                // Check if civilian is swarm adopter or selfish (we can color based on local state)
                const isSwarm = localVehicles[pos.id] ? !localVehicles[pos.id].selfish : Math.random() > 0.5;
                if (isSwarm) {
                    el.classList.add('swarm-marker');
                } else {
                    el.classList.add('selfish-marker');
                }
                el.innerHTML = '<i class="fa-solid fa-car"></i>';
                civilianCount++;
            }

            marker = new mapboxgl.Marker(el)
                .setLngLat([pos.lng, pos.lat])
                .addTo(map);
                
            markers[pos.id] = marker;
        } else {
            // Move marker coordinates
            marker.setLngLat([pos.lng, pos.lat]);
        }
    });

    // Remove expired markers
    Object.keys(markers).forEach(id => {
        if (!activeIds.has(id)) {
            markers[id].remove();
            delete markers[id];
        }
    });

    // Update statistics dashboard
    statActiveCount.textContent = positions.length;
    
    // Update map edge congestion visual layer based on vehicle positions
    updateMapEdgeLoads(positions);
}

// Calculate street network loads
function updateMapEdgeLoads(positions) {
    if (!map || !map.getSource('streets')) return;

    // Reset loads
    currentEdgeLoads = {};
    EDGES.forEach(e => { currentEdgeLoads[e.id] = 0; });

    positions.forEach(pos => {
        // Find which edge this vehicle is currently on
        const vState = localVehicles[pos.id];
        if (vState && vState.path && vState.pathIndex < vState.path.length) {
            const edgeId = vState.path[vState.pathIndex];
            if (currentEdgeLoads[edgeId] !== undefined) {
                currentEdgeLoads[edgeId]++;
            }
        }
    });

    // Update map street layers
    const features = EDGES.map(edge => {
        const fromNode = NODES[edge.from];
        const toNode = NODES[edge.to];
        const load = currentEdgeLoads[edge.id] || 0;
        return {
            "type": "Feature",
            "properties": { "id": edge.id, "load": load },
            "geometry": {
                "type": "LineString",
                "coordinates": [fromNode.coords, toNode.coords]
            }
        };
    });

    map.getSource('streets').setData({
        "type": "FeatureCollection",
        "features": features
    });

    // Compute average congestion index
    let totalLoad = 0;
    let totalCap = 0;
    EDGES.forEach(edge => {
        const load = currentEdgeLoads[edge.id] || 0;
        totalLoad += load;
        totalCap += edge.cap;
    });

    const congestionRatio = totalCap > 0 ? (totalLoad / totalCap) * 100 : 0;
    const finalCongestion = Math.min(100, Math.round(congestionRatio * 3.5)); // scale factor for visual impact
    statCongestionPct.textContent = finalCongestion + "%";
    statCongestionFill.style.width = finalCongestion + "%";
    
    // Color thresholds
    statCongestionFill.className = "progress-fill";
    if (finalCongestion < 25) {
        statCongestionFill.classList.add("green");
        statCongestionPct.className = "stat-value text-green";
    } else if (finalCongestion < 60) {
        statCongestionFill.classList.add("orange");
        statCongestionPct.className = "stat-value text-orange";
    } else {
        statCongestionFill.classList.add("red");
        statCongestionPct.className = "stat-value text-red";
    }
}

// Spawning Vehicles Logic
function spawnCivilian() {
    const id = "c_" + Math.random().toString(36).substr(2, 6);
    const nodeIDs = Object.keys(NODES);
    const origin = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    let dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    while (dest === origin) {
        dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    }

    const adoptionRate = parseInt(adoptionSlider.value);
    const isSelfish = Math.random() * 100 > adoptionRate;

    const req = {
        vehicle_id: id,
        origin: origin,
        destination: dest,
        type: 0, // Civilian
        selfish: isSelfish,
        emergency: false,
        fleet_id: ""
    };

    localVehicles[id] = {
        id: id,
        origin: origin,
        destination: dest,
        type: 0,
        selfish: isSelfish,
        path: [],
        pathIndex: 0,
        progress: 0, // percentage along current edge (0 to 1)
        lat: NODES[origin].coords[1],
        lng: NODES[origin].coords[0]
    };

    // Register vehicle on server first
    socket.send(JSON.stringify({
        type: "register_vehicle",
        payload: {
            id: id,
            type: 0,
            origin: origin,
            destination: dest,
            current_edge: "",
            lat: NODES[origin].coords[1],
            lng: NODES[origin].coords[0]
        }
    }));

    // Request path
    socket.send(JSON.stringify({
        type: "route_request",
        payload: req
    }));
}

function spawnFleet() {
    const fleetID = "fleet_athens_" + Math.random().toString(36).substr(2, 4);
    
    // Spawn 3 delivery vans starting from Kolonaki (E) to random destinations
    const destinations = ["H", "I", "B"];
    
    destinations.forEach((dest, idx) => {
        const id = `f_${fleetID}_${idx}`;
        const origin = "E"; // Kolonaki depot

        localVehicles[id] = {
            id: id,
            origin: origin,
            destination: dest,
            type: 1, // Delivery
            selfish: false,
            fleet_id: fleetID,
            path: [],
            pathIndex: 0,
            progress: 0,
            lat: NODES[origin].coords[1],
            lng: NODES[origin].coords[0]
        };

        socket.send(JSON.stringify({
            type: "register_vehicle",
            payload: {
                id: id,
                type: 1,
                origin: origin,
                destination: dest,
                current_edge: "",
                fleet_id: fleetID,
                lat: NODES[origin].coords[1],
                lng: NODES[origin].coords[0]
            }
        }));

        socket.send(JSON.stringify({
            type: "route_request",
            payload: {
                vehicle_id: id,
                origin: origin,
                destination: dest,
                type: 1,
                selfish: false,
                emergency: false,
                fleet_id: fleetID
            }
        }));
    });
}

function spawnEmergency() {
    const id = "e_" + Math.random().toString(36).substr(2, 6);
    // Emergency vehicle goes from Evangelismos (F) to Kerameikos (H)
    const origin = "F";
    const dest = "H";

    localVehicles[id] = {
        id: id,
        origin: origin,
        destination: dest,
        type: 2, // Emergency
        selfish: false,
        path: [],
        pathIndex: 0,
        progress: 0,
        lat: NODES[origin].coords[1],
        lng: NODES[origin].coords[0]
    };

    socket.send(JSON.stringify({
        type: "register_vehicle",
        payload: {
            id: id,
            type: 2,
            origin: origin,
            destination: dest,
            current_edge: "",
            lat: NODES[origin].coords[1],
            lng: NODES[origin].coords[0]
        }
    }));

    socket.send(JSON.stringify({
        type: "route_request",
        payload: {
            vehicle_id: id,
            origin: origin,
            destination: dest,
            type: 2,
            selfish: false,
            emergency: true,
            fleet_id: ""
        }
    }));
}

function handleRouteResponse(resp) {
    const v = localVehicles[resp.vehicle_id];
    if (!v) return;

    v.path = resp.path.edges;
    v.pathIndex = 0;
    v.progress = 0;

    // Display Karma flow points
    if (resp.flow_points_earned > 0) {
        totalKarma += resp.flow_points_earned;
        statFlowPoints.textContent = totalKarma;
        
        // Show a brief floating text on UI for satisfaction
        showFloatingPointsText(resp.flow_points_earned);
    }

    // Trigger initial stats calculation
    calculateAvgTime();
}

function showFloatingPointsText(pts) {
    const label = document.createElement("div");
    label.className = "floating-points-alert";
    label.textContent = `+${pts} Flow Points (Karma)`;
    document.body.appendChild(label);
    
    setTimeout(() => {
        label.remove();
    }, 2500);
}

// Helper to calculate total distance of an edge using straight-line distance
function getEdgeDistance(edgeId) {
    const edge = EDGES.find(e => e.id === edgeId);
    if (edge) {
        const fromNode = NODES[edge.from];
        const toNode = NODES[edge.to];
        if (fromNode && toNode) {
            return getDistance(fromNode.coords, toNode.coords);
        }
    }
    return 0;
}

// Calculate realistic travel time dynamically based on fully/partially traversed edges
function getRealisticTime(v) {
    if (!v || !v.path || v.path.length === 0) return 0;
    let totalTime = 0;
    
    // Loop through all traversed edges in the path
    for (let i = 0; i <= v.pathIndex && i < v.path.length; i++) {
        const edgeId = v.path[i];
        const edgeDistance = getEdgeDistance(edgeId);
        if (edgeDistance <= 0) continue;
        
        const portion = (i === v.pathIndex) ? v.progress : 1.0;
        const distanceTraversed = portion * edgeDistance;
        
        let speed = (v.type === 2) ? 20.0 : 13.89; // 20 m/s for emergency, 13.89 m/s for civilian/fleet
        
        const edgeObj = EDGES.find(e => e.id === edgeId);
        if (edgeObj && edgeObj.cap > 0) {
            const load = currentEdgeLoads[edgeId] || 0;
            const loadFactor = load / edgeObj.cap;
            speed = speed / (1.0 + 0.15 * Math.pow(loadFactor, 4));
        }
        
        totalTime += distanceTraversed / speed;
    }
    
    return Math.round(totalTime);
}

function calculateAvgTime() {
    let sumTime = 0;
    let count = 0;
    
    Object.values(localVehicles).forEach(v => {
        if (v.path.length > 0) {
            sumTime += getRealisticTime(v);
            count++;
        }
    });

    if (count > 0) {
        statAvgTime.textContent = (sumTime / count).toFixed(1) + "s";
    } else {
        statAvgTime.textContent = "0.0s";
    }
}

function clearSimulation() {
    // Clear all client side models
    localVehicles = {};
    Object.keys(markers).forEach(id => {
        markers[id].remove();
        delete markers[id];
    });
    totalKarma = 0;
    statFlowPoints.textContent = "0";
    statActiveCount.textContent = "0";
    statAvgTime.textContent = "0.0s";
    statCongestionPct.textContent = "0%";
    statCongestionFill.style.width = "0%";
    updateMapEdgeLoads([]);
}

// Client-Side Telemetry Simulation Loop
function startSimulationLoop() {
    setInterval(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        Object.keys(localVehicles).forEach(id => {
            const v = localVehicles[id];
            if (!v || v.path.length === 0) return;

            // Compute vehicle movement along current edge
            const currentEdgeId = v.path[v.pathIndex];
            const edge = EDGES.find(e => e.id === currentEdgeId);
            if (!edge) return;

            // Speed: Emergency vehicles move faster. Detour speed is constant.
            let speed = (v.type === 2) ? 20.0 : 13.89; // 20 m/s or 13.89 m/s
            
            const edgeObj = EDGES.find(e => e.id === currentEdgeId);
            if (edgeObj && edgeObj.cap > 0) {
                const load = currentEdgeLoads[currentEdgeId] || 0;
                const loadFactor = load / edgeObj.cap;
                speed = speed / (1.0 + 0.15 * Math.pow(loadFactor, 4));
            }
            
            const edgeDistance = getEdgeDistance(currentEdgeId);
            let speedStep = 0.08; // fallback
            if (edgeDistance > 0) {
                // 150ms tick rate means dt = 0.15s
                speedStep = (speed * 0.15) / edgeDistance;
            }

            v.progress += speedStep;

            if (v.progress >= 1.0) {
                // Move to next edge in path
                v.progress = 0;
                v.pathIndex++;

                if (v.pathIndex >= v.path.length) {
                    // Vehicle reached destination! Clean up.
                    socket.send(JSON.stringify({
                        type: "update_position",
                        payload: {
                            vehicle_id: v.id,
                            lat: NODES[v.destination].coords[1],
                            lng: NODES[v.destination].coords[0],
                            current_edge: ""
                        }
                    }));
                    if (v.id === "user_nav_vehicle") {
                        speakInstruction(`Arrived at destination, ${NODES[v.destination].name}`);
                        stopUserNavigation();
                    } else {
                        delete localVehicles[v.id];
                    }
                    return;
                }
            }

            // Interpolate position coordinate
            const fromNode = NODES[edge.from];
            const toNode = NODES[edge.to];
            
            const lng = fromNode.coords[0] + (toNode.coords[0] - fromNode.coords[0]) * v.progress;
            const lat = fromNode.coords[1] + (toNode.coords[1] - fromNode.coords[1]) * v.progress;

            v.lat = lat;
            v.lng = lng;

            // Report telemetry update back to server via websocket
            socket.send(JSON.stringify({
                type: "update_position",
                payload: {
                    vehicle_id: v.id,
                    lat: lat,
                    lng: lng,
                    current_edge: edge.id
                }
            }));

            // If this is the user navigation vehicle and GPS mode is active, follow it
            if (id === "user_nav_vehicle" && isUserNavigating) {
                const edgeBearing = getBearing(fromNode.coords, toNode.coords);
                if (map) {
                    map.easeTo({
                        center: [lng, lat],
                        zoom: 17,
                        pitch: 60,
                        bearing: edgeBearing,
                        duration: 150,
                        easing: (t) => t
                    });
                }
                updateNavigationHUD(v);
            }
        });
    }, 150); // 150ms tick rate
}

// --- Turn-by-Turn Navigation & Voice Announcement Logic ---

// Calculate distance (meters) between two [Lng, Lat] coordinates (Haversine Formula)
function getDistance(coords1, coords2) {
    const lon1 = coords1[0];
    const lat1 = coords1[1];
    const lon2 = coords2[0];
    const lat2 = coords2[1];
    
    const R = 6371000; // Earth radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate bearing (degrees) between two [Lng, Lat] coordinates
function getBearing(coords1, coords2) {
    const lng1 = coords1[0];
    const lat1 = coords1[1];
    const lng2 = coords2[0];
    const lat2 = coords2[1];
    
    const dLng = lng2 - lng1;
    const dLat = lat2 - lat1;
    
    // Mapbox bearing is -180 to 180 (North is 0, East is 90)
    return Math.atan2(dLng, dLat) * 180 / Math.PI;
}

// Angle-based direction instruction logic
function getTurnInstruction(currentEdgeId, nextEdgeId) {
    if (!currentEdgeId) return null;
    
    const currEdge = EDGES.find(e => e.id === currentEdgeId);
    if (!currEdge) return null;
    
    const currFromNode = NODES[currEdge.from];
    const currToNode = NODES[currEdge.to];
    const currBearing = getBearing(currFromNode.coords, currToNode.coords);
    
    if (!nextEdgeId) {
        return {
            text: `Arrive at your destination, ${currToNode.name}`,
            iconClass: "fa-solid fa-location-dot",
            bearing: currBearing
        };
    }
    
    const nextEdge = EDGES.find(e => e.id === nextEdgeId);
    if (!nextEdge) return null;
    
    const nextFromNode = NODES[nextEdge.from];
    const nextToNode = NODES[nextEdge.to];
    const nextBearing = getBearing(nextFromNode.coords, nextToNode.coords);
    
    let diff = nextBearing - currBearing;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    
    const nextStreetName = STREET_NAMES[nextEdgeId] || "Athens Street";
    let direction = "";
    let iconClass = "";
    
    if (diff >= -35 && diff <= 35) {
        direction = `Continue straight onto ${nextStreetName}`;
        iconClass = "fa-solid fa-arrow-up";
    } else if (diff > 35 && diff <= 145) {
        direction = `Turn right onto ${nextStreetName}`;
        iconClass = "fa-solid fa-arrow-turn-up-right";
    } else if (diff < -35 && diff >= -145) {
        direction = `Turn left onto ${nextStreetName}`;
        iconClass = "fa-solid fa-arrow-turn-up-left";
    } else {
        direction = `Make a U-turn onto ${nextStreetName}`;
        iconClass = "fa-solid fa-arrow-rotate-left";
    }
    
    return {
        text: direction,
        iconClass: iconClass,
        bearing: currBearing
    };
}

// Update the navigation HUD UI overlay
function updateNavigationHUD(v) {
    if (!v || v.path.length === 0) return;
    
    const currentEdgeId = v.path[v.pathIndex];
    const nextEdgeId = v.path[v.pathIndex + 1];
    
    const instructionObj = getTurnInstruction(currentEdgeId, nextEdgeId);
    if (!instructionObj) return;
    
    const instructionEl = document.getElementById("hud-instruction");
    const iconEl = document.getElementById("hud-turn-icon");
    
    if (instructionEl) instructionEl.textContent = instructionObj.text;
    if (iconEl) iconEl.className = instructionObj.iconClass;
    
    // Voice guidance announcement
    speakInstruction(instructionObj.text);
    
    // Calculate total remaining distance in meters
    let totalDistRemaining = 0;
    
    // Current edge segment remaining distance
    const currEdge = EDGES.find(e => e.id === currentEdgeId);
    if (currEdge) {
        const fromNode = NODES[currEdge.from];
        const toNode = NODES[currEdge.to];
        const edgeLen = getDistance(fromNode.coords, toNode.coords);
        totalDistRemaining += edgeLen * (1 - v.progress);
    }
    
    // Remaining subsequent edge segments
    for (let i = v.pathIndex + 1; i < v.path.length; i++) {
        const edgeId = v.path[i];
        const edge = EDGES.find(e => e.id === edgeId);
        if (edge) {
            const fromNode = NODES[edge.from];
            const toNode = NODES[edge.to];
            totalDistRemaining += getDistance(fromNode.coords, toNode.coords);
        }
    }
    
    const distanceEl = document.getElementById("hud-distance");
    const etaEl = document.getElementById("hud-eta");
    
    if (distanceEl) {
        distanceEl.innerHTML = `<i class="fa-solid fa-route"></i> ${Math.round(totalDistRemaining)} m`;
    }
    
    if (etaEl) {
        // ETA: 12 m/s for civilian, 24 m/s for emergency vehicle
        const speed = v.type === 2 ? 24 : 12;
        const etaSeconds = Math.round(totalDistRemaining / speed);
        etaEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${etaSeconds} s remaining`;
    }
}

// Speak turn instruction out loud using Web Speech API
function speakInstruction(text) {
    if (!text || text === lastSpokenInstruction) return;
    lastSpokenInstruction = text;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        // Optimize voice parameters for clear speech
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// Start first-person GPS navigation tracking mode
function startUserNavigation(origin, dest, isSelfish, isEmergency) {
    // Clear any previous user navigation instance
    if (localVehicles["user_nav_vehicle"]) {
        if (markers["user_nav_vehicle"]) {
            markers["user_nav_vehicle"].remove();
            delete markers["user_nav_vehicle"];
        }
        delete localVehicles["user_nav_vehicle"];
    }
    
    lastSpokenInstruction = "";
    
    // UI state updates
    if (btnStartNav) btnStartNav.disabled = true;
    if (btnStopNav) btnStopNav.disabled = false;
    
    isUserNavigating = true;
    
    const hud = document.getElementById("navigation-hud");
    if (hud) {
        hud.classList.remove("hidden");
        if (isEmergency) {
            hud.classList.add("emergency");
        } else {
            hud.classList.remove("emergency");
        }
        
        // Reset HUD texts
        const instructionEl = document.getElementById("hud-instruction");
        const distanceEl = document.getElementById("hud-distance");
        const etaEl = document.getElementById("hud-eta");
        if (instructionEl) instructionEl.textContent = "Calculating route...";
        if (distanceEl) distanceEl.innerHTML = `<i class="fa-solid fa-route"></i> -- m`;
        if (etaEl) etaEl.innerHTML = `<i class="fa-solid fa-clock"></i> -- s remaining`;
    }
    
    // Initialize navigation vehicle
    localVehicles["user_nav_vehicle"] = {
        id: "user_nav_vehicle",
        origin: origin,
        destination: dest,
        type: isEmergency ? 2 : 0,
        selfish: isSelfish,
        path: [],
        pathIndex: 0,
        progress: 0,
        lat: NODES[origin].coords[1],
        lng: NODES[origin].coords[0]
    };
    
    // Register on the server first
    socket.send(JSON.stringify({
        type: "register_vehicle",
        payload: {
            id: "user_nav_vehicle",
            type: isEmergency ? 2 : 0,
            origin: origin,
            destination: dest,
            current_edge: "",
            lat: NODES[origin].coords[1],
            lng: NODES[origin].coords[0]
        }
    }));
    
    // Request routing path from backend
    socket.send(JSON.stringify({
        type: "route_request",
        payload: {
            vehicle_id: "user_nav_vehicle",
            origin: origin,
            destination: dest,
            type: isEmergency ? 2 : 0,
            selfish: isSelfish,
            emergency: isEmergency,
            fleet_id: ""
        }
    }));
}

// Stop user navigation tracking mode and restore default camera
function stopUserNavigation() {
    isUserNavigating = false;
    
    if (localVehicles["user_nav_vehicle"]) {
        socket.send(JSON.stringify({
            type: "update_position",
            payload: {
                vehicle_id: "user_nav_vehicle",
                lat: localVehicles["user_nav_vehicle"].lat,
                lng: localVehicles["user_nav_vehicle"].lng,
                current_edge: ""
            }
        }));
        delete localVehicles["user_nav_vehicle"];
    }
    
    if (markers["user_nav_vehicle"]) {
        markers["user_nav_vehicle"].remove();
        delete markers["user_nav_vehicle"];
    }
    
    // UI state updates
    if (btnStartNav) btnStartNav.disabled = false;
    if (btnStopNav) btnStopNav.disabled = true;
    
    const hud = document.getElementById("navigation-hud");
    if (hud) {
        hud.classList.add("hidden");
        hud.classList.remove("emergency");
    }
    
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    
    // Return to default Athens coordinates & styling
    if (map) {
        map.easeTo({
            center: [23.7310, 37.9760],
            zoom: 14.2,
            pitch: 50,
            bearing: -10,
            duration: 1000
        });
    }
}
