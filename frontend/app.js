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
    { id: "E-A", from: "E", to: "A", cap: 10 },
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
let roadGeometries = {};
let totalKarma = 0;
let currentAdoptionRate = 0;
let autoSpawnInterval = null;
let followedVehicleId = null;

// UI Elements
const adoptionSlider = document.getElementById("adoption-rate");
const adoptionVal = document.getElementById("adoption-rate-val");
const iotToggle = document.getElementById("iot-toggle");
const autospawnToggle = document.getElementById("autospawn-toggle");
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

// Fetch and cache road geometries from Mapbox Directions API
async function loadRoadGeometries() {
    const cacheKey = "swarmroute_road_geometries";
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            roadGeometries = JSON.parse(cached);
            const missing = EDGES.some(edge => !roadGeometries[edge.id]);
            if (!missing) {
                console.log("Loaded road geometries from cache");
                return;
            }
        } catch (e) {
            console.error("Error parsing cached road geometries", e);
        }
    }

    console.log("Fetching road geometries from Mapbox...");
    roadGeometries = {};
    
    const fetchPromises = EDGES.map(async (edge) => {
        const fromNode = NODES[edge.from];
        const toNode = NODES[edge.to];
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromNode.coords[0]},${fromNode.coords[1]};${toNode.coords[0]},${toNode.coords[1]}?overview=full&geometries=geojson&access_token=${mapboxToken}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.routes && data.routes.length > 0 && data.routes[0].geometry) {
                roadGeometries[edge.id] = data.routes[0].geometry.coordinates;
            } else {
                roadGeometries[edge.id] = [fromNode.coords, toNode.coords];
            }
        } catch (error) {
            console.error(`Failed to fetch geometry for edge ${edge.id}`, error);
            roadGeometries[edge.id] = [fromNode.coords, toNode.coords];
        }
    });

    await Promise.all(fetchPromises);
    localStorage.setItem(cacheKey, JSON.stringify(roadGeometries));
    console.log("Fetched and cached road geometries");
}

// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
    if (mapboxToken) {
        tokenInput.value = mapboxToken;
        await initMap();
    } else {
        modalToken.classList.remove("hidden");
    }

    setupEventListeners();
    connectWebSocket();
    startSimulationLoop();

    // AI IoT Real-Time Monitoring Loop
    setInterval(() => {
        if (typeof iotToggle !== 'undefined' && iotToggle && iotToggle.checked) {
            triggerIoTReRoute(false);
        }
    }, 1000);
});

function setupEventListeners() {
    // Save token actions
    if (btnSaveToken) {
        btnSaveToken.addEventListener("click", () => {
            const tok = tokenInput.value.trim();
            if (tok) {
                localStorage.setItem("mapbox_token", tok);
                location.reload();
            }
        });
    }

    if (btnModalSave) {
        btnModalSave.addEventListener("click", () => {
            const tok = modalTokenInput.value.trim();
            if (tok) {
                localStorage.setItem("mapbox_token", tok);
                modalToken.classList.add("hidden");
                location.reload();
            }
        });
    }

    // Slider listener
    if (adoptionSlider && adoptionSlider.parentElement) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'adoption-buttons';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';
        btnContainer.style.margin = '10px 0';
        [25, 50, 75, 100].forEach(rate => {
            const btn = document.createElement('button');
            btn.textContent = rate + '%';
            btn.className = 'btn btn-outline';
            btn.style.flex = '1';
            btn.style.padding = '10px';
            btn.style.fontWeight = 'bold';
            btn.style.fontSize = '1.1em';
            btn.onclick = () => {
                currentAdoptionRate = rate;
                if (adoptionVal) adoptionVal.textContent = rate + '%';
                
                Array.from(btnContainer.children).forEach(b => {
                    b.className = 'btn btn-outline';
                });
                btn.className = 'btn btn-primary';
                
                triggerIoTReRoute(true); // Force reroute on adoption change
            };
            btnContainer.appendChild(btn);
        });
        adoptionSlider.parentElement.replaceChild(btnContainer, adoptionSlider);
    }

    // Spawn triggers
    if (btnSpawnEmergency) btnSpawnEmergency.addEventListener("click", () => spawnEmergency());
    if (btnClearSim) btnClearSim.addEventListener("click", () => clearSimulation());

    // Auto-Spawn Toggle
    if (autospawnToggle) {
        autospawnToggle.addEventListener("change", (e) => {
            if (e.target.checked) {
                startAutoSpawn();
            } else {
                stopAutoSpawn();
            }
        });
    }

    // IoT Toggle Listener
    if (typeof iotToggle !== 'undefined' && iotToggle) {
        iotToggle.addEventListener("change", (e) => {
            if (e.target.checked) {
                triggerIoTReRoute(true); // Force immediate AI optimization sweep
            }
        });
    }
}

// Mapbox Setup
async function initMap() {
    mapboxgl.accessToken = mapboxToken;
    await loadRoadGeometries();
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

    map.on('click', () => {
        if (followedVehicleId) {
            followedVehicleId = null;
            clearRouteHighlight();
            map.easeTo({
                center: [23.7310, 37.9760],
                zoom: 14.2,
                pitch: 50,
                bearing: -10,
                duration: 1000
            });
        }
    });
}

// Draw Athens Graph Edges
function drawStreetNetwork() {
    const features = EDGES.map(edge => {
        const coords = roadGeometries[edge.id] || [NODES[edge.from].coords, NODES[edge.to].coords];
        return {
            "type": "Feature",
            "properties": { "id": edge.id, "load": 0 },
            "geometry": {
                "type": "LineString",
                "coordinates": coords
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
                0, "#10b981", // Green
                3, "#f59e0b", // Orange
                8, "#ef4444", // Red
                100, "#a855f7" // IoT Neon Purple Alert
            ],
            "line-width": 4,
            "line-opacity": 0.5
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

function drawRouteHighlight(vehicleId) {
    if (!map) return;
    if (!vehicleId || !localVehicles[vehicleId] || !localVehicles[vehicleId].path || localVehicles[vehicleId].path.length === 0) {
        clearRouteHighlight();
        return;
    }

    const v = localVehicles[vehicleId];
    const coordinates = [];
    
    coordinates.push([v.lng, v.lat]);

    const currentEdgeId = v.path[v.pathIndex];
    const currentEdge = EDGES.find(e => e.id === currentEdgeId);
    if (currentEdge) {
        coordinates.push(NODES[currentEdge.to].coords);
    }

    for (let i = v.pathIndex + 1; i < v.path.length; i++) {
        const edgeId = v.path[i];
        const geom = roadGeometries[edgeId];
        if (geom) {
            coordinates.push(...geom);
        } else {
            const edge = EDGES.find(e => e.id === edgeId);
            if (edge) {
                coordinates.push(NODES[edge.from].coords);
                coordinates.push(NODES[edge.to].coords);
            }
        }
    }

    const geojson = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        }
    };

    let lineColor = "#00ffff"; // Default cyan for Swarm
    if (v.type === 2) lineColor = "#ff0055"; // Emergency
    else if (v.type === 1) lineColor = "#0055ff"; // Fleet
    else if (v.selfish) lineColor = "#888888"; // Selfish

    if (map.getSource('highlight-route')) {
        map.getSource('highlight-route').setData(geojson);
        map.setPaintProperty('highlight-route-line', 'line-color', lineColor);
        map.setPaintProperty('highlight-route-glow', 'line-color', lineColor);
    } else {
        map.addSource('highlight-route', { "type": "geojson", "data": geojson });
        
        map.addLayer({
            "id": "highlight-route-glow",
            "type": "line",
            "source": "highlight-route",
            "layout": { "line-join": "round", "line-cap": "round" },
            "paint": { "line-color": lineColor, "line-width": 8, "line-opacity": 0.4, "line-blur": 4 }
        });
        
        map.addLayer({
            "id": "highlight-route-line",
            "type": "line",
            "source": "highlight-route",
            "layout": { "line-join": "round", "line-cap": "round" },
            "paint": { "line-color": lineColor, "line-width": 4, "line-opacity": 1.0 }
        });
    }
}

function clearRouteHighlight() {
    if (map && map.getSource('highlight-route')) {
        map.getSource('highlight-route').setData({
            "type": "FeatureCollection",
            "features": []
        });
    }
}

function clearSimulation() {
    // Tell backend to remove all vehicles
    Object.keys(markers).forEach(id => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const pos = markers[id].getLngLat();
            socket.send(JSON.stringify({
                type: "update_position",
                payload: {
                    vehicle_id: id,
                    lat: pos.lat,
                    lng: pos.lng,
                    current_edge: "finished"
                }
            }));
        }
    });

    localVehicles = {};
    Object.keys(markers).forEach(id => {
        markers[id].remove();
        delete markers[id];
    });
    totalKarma = 0;
    if (typeof statFlowPoints !== 'undefined' && statFlowPoints) statFlowPoints.textContent = "0";
    if (typeof statActiveCount !== 'undefined' && statActiveCount) statActiveCount.textContent = "0";
    if (typeof statAvgTime !== 'undefined' && statAvgTime) statAvgTime.textContent = "0.0s";
    if (typeof statCongestionPct !== 'undefined' && statCongestionPct) statCongestionPct.textContent = "0%";
    if (typeof statCongestionFill !== 'undefined' && statCongestionFill) statCongestionFill.style.width = "0%";
    followedVehicleId = null;
    clearRouteHighlight();
    updateMapEdgeLoads([]);
}

// Spawning Vehicles Logic
function spawnCivilian() {
    if (Object.keys(localVehicles).length >= 250) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const id = "c_" + Math.random().toString(36).substr(2, 6);
    const nodeIDs = Object.keys(NODES);
    const origin = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    let dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    while (dest === origin) {
        dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    }

    const isSelfish = Math.random() * 100 > currentAdoptionRate;

    localVehicles[id] = {
        id: id,
        origin: origin,
        destination: dest,
        type: 0, // Civilian
        selfish: isSelfish,
        path: [],
        pathIndex: 0,
        progress: 0,
        lat: NODES[origin].coords[1],
        lng: NODES[origin].coords[0],
        spawnTime: Date.now()
    };

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

    socket.send(JSON.stringify({
        type: "route_request",
        payload: {
            vehicle_id: id,
            origin: origin,
            destination: dest,
            type: 0,
            selfish: isSelfish,
            emergency: false,
            fleet_id: ""
        }
    }));
}

function spawnFleet() {
    if (Object.keys(localVehicles).length >= 250) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const fleetID = "fleet_athens_" + Math.random().toString(36).substr(2, 4);
    const nodeIDs = Object.keys(NODES);
    
    for (let idx = 0; idx < 3; idx++) {
        if (Object.keys(localVehicles).length >= 250) break;
        const id = `f_${fleetID}_${idx}`;
        const origin = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
        let dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
        while (dest === origin) {
            dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
        }

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
            lng: NODES[origin].coords[0],
            spawnTime: Date.now()
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
    }
}

function spawnEmergency() {
    if (Object.keys(localVehicles).length >= 250) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const id = "e_" + Math.random().toString(36).substr(2, 6);
    const nodeIDs = Object.keys(NODES);
    const origin = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    let dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    while (dest === origin) {
        dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    }

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
        lng: NODES[origin].coords[0],
        spawnTime: Date.now()
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

    triggerIoTReRoute(true);
}

function handleRouteResponse(resp) {
    const v = localVehicles[resp.vehicle_id];
    if (!v) return;

    if (v.pendingReroute) {
        v.pendingReroute = false;
        const currentEdgeId = v.path[v.pathIndex];
        v.path = [currentEdgeId, ...resp.path.edges];
        v.pathIndex = 0;
    } else {
        v.path = resp.path.edges;
        v.pathIndex = 0;
        v.progress = 0;
    }

    if (resp.flow_points_earned > 0) {
        totalKarma += resp.flow_points_earned;
        if (typeof statFlowPoints !== 'undefined' && statFlowPoints) {
            statFlowPoints.textContent = totalKarma;
        }
    }
    
    calculateAvgTime();
}

// Auto-Spawning Control Loop
function startAutoSpawn() {
    if (autoSpawnInterval) clearInterval(autoSpawnInterval);
    spawnMultipleCiviliansAndFleets(3);
    autoSpawnInterval = setInterval(() => {
        spawnMultipleCiviliansAndFleets(3);
    }, 3000);
}

function stopAutoSpawn() {
    if (autoSpawnInterval) {
        clearInterval(autoSpawnInterval);
        autoSpawnInterval = null;
    }
}

function spawnMultipleCiviliansAndFleets(count) {
    for (let i = 0; i < count; i++) {
        if (Math.random() > 0.2) spawnCivilian(); // 80% chance civilian
        else spawnFleet();                        // 20% chance fleet van
    }
}

// WebSocket Connection
function connectWebSocket() {
    socket = new WebSocket("ws://localhost:8080/ws");

    socket.onopen = () => {
        console.log("Connected to SwarmRoute WebSocket Server");
        startAutoSpawn(); // Automatically start spawning randomly assigned vehicles
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
    if (!positions) return;
    
    // Keep track of active IDs
    const activeIds = new Set();
    let civilianCount = 0;
    let fleetCount = 0;
    let emergencyCount = 0;

    positions.forEach(pos => {
        if (pos.current_edge === "finished") return;
        activeIds.add(pos.id);
        
        let marker = markers[pos.id];
        if (!marker) {
            // Create DOM element for marker
            const el = document.createElement('div');
            el.className = 'vehicle-marker';
            
            // Set styles based on vehicle types
            if (pos.type === 2) { // Emergency
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

            // Click to follow camera
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (followedVehicleId === pos.id) {
                    followedVehicleId = null;
                clearRouteHighlight();
                    if (map) {
                        map.easeTo({
                            center: [23.7310, 37.9760],
                            zoom: 14.2,
                            pitch: 50,
                            bearing: -10,
                            duration: 1000
                        });
                    }
                } else {
                    followedVehicleId = pos.id;
                drawRouteHighlight(pos.id);
                }
            });
                
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
    if (typeof statActiveCount !== 'undefined' && statActiveCount) {
        statActiveCount.textContent = positions.length;
    }
    
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
    const isIoTEnabled = typeof iotToggle !== 'undefined' && iotToggle && iotToggle.checked;

    const features = EDGES.map(edge => {
        const coords = roadGeometries[edge.id] || [NODES[edge.from].coords, NODES[edge.to].coords];
        let load = currentEdgeLoads[edge.id] || 0;
        
        if (isIoTEnabled && edge.cap > 0 && load / edge.cap >= 0.6) {
            load = 100; // Trigger IoT Neon Purple Alert styling
        }

        return {
            "type": "Feature",
            "properties": { "id": edge.id, "load": load },
            "geometry": {
                "type": "LineString",
                "coordinates": coords
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
    if (typeof statCongestionPct !== 'undefined' && statCongestionPct) statCongestionPct.textContent = finalCongestion + "%";
    if (typeof statCongestionFill !== 'undefined' && statCongestionFill) statCongestionFill.style.width = finalCongestion + "%";
    
    // Color thresholds
    if (typeof statCongestionFill !== 'undefined' && statCongestionFill) {
        statCongestionFill.className = "progress-fill";
        if (finalCongestion < 25) {
            statCongestionFill.classList.add("green");
            if (statCongestionPct) statCongestionPct.className = "stat-value text-green";
        } else if (finalCongestion < 60) {
            statCongestionFill.classList.add("orange");
            if (statCongestionPct) statCongestionPct.className = "stat-value text-orange";
        } else {
            statCongestionFill.classList.add("red");
            if (statCongestionPct) statCongestionPct.className = "stat-value text-red";
        }
    }
}

// Spawning Vehicles Logic
function spawnCivilian() {
    if (Object.keys(localVehicles).length >= 100) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const id = "c_" + Math.random().toString(36).substr(2, 6);
    const nodeIDs = Object.keys(NODES);
    const origin = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    let dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    while (dest === origin) {
        dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    }

    const isSelfish = Math.random() * 100 > currentAdoptionRate;

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
    if (Object.keys(localVehicles).length >= 100) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const fleetID = "fleet_athens_" + Math.random().toString(36).substr(2, 4);
    const nodeIDs = Object.keys(NODES);
    
    for (let idx = 0; idx < 3; idx++) {
        if (Object.keys(localVehicles).length >= 100) break;
        const id = `f_${fleetID}_${idx}`;
        const origin = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
        let dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
        while (dest === origin) {
            dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
        }

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
    }
}

function spawnEmergency() {
    if (Object.keys(localVehicles).length >= 100) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const id = "e_" + Math.random().toString(36).substr(2, 6);
    const nodeIDs = Object.keys(NODES);
    const origin = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    let dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    while (dest === origin) {
        dest = nodeIDs[Math.floor(Math.random() * nodeIDs.length)];
    }

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

    triggerIoTReRoute(true); // Force reroute on emergency spawn
}

function handleRouteResponse(resp) {
    const v = localVehicles[resp.vehicle_id];
    if (!v) return;

    if (v.pendingReroute) {
        v.pendingReroute = false;
        const currentEdgeId = v.path[v.pathIndex];
        v.path = [currentEdgeId, ...resp.path.edges];
        v.pathIndex = 0;
    } else {
        v.path = resp.path.edges;
        v.pathIndex = 0;
        v.progress = 0;
    }

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

function triggerIoTReRoute(force = false) {
    let isIoTEnabled = false;
    if (typeof iotToggle !== 'undefined' && iotToggle) {
        isIoTEnabled = iotToggle.checked;
    }
    
    if (!force && !isIoTEnabled) return;

    // IoT sensors detect congestion faster (60% instead of 80%)
    const threshold = isIoTEnabled ? 0.6 : 0.8;

    let congestedEdges = new Set();
    EDGES.forEach(edge => {
        const load = currentEdgeLoads[edge.id] || 0;
        if (edge.cap > 0 && load / edge.cap >= threshold) {
            congestedEdges.add(edge.id);
        }
    });

    if (congestedEdges.size > 0 || force) {
        const now = Date.now();
        Object.keys(localVehicles).forEach(id => {
            const v = localVehicles[id];
            if (v.pendingReroute) return;
            if (v.lastRerouteTime && now - v.lastRerouteTime < 3000) return; // 3 second cooldown

            if ((v.type === 0 || v.type === 1) && v.path && v.pathIndex < v.path.length) {
                let crossesCongestion = force;
                if (!crossesCongestion) {
                    // Check if the remaining path intersects with any congested edges
                    for (let i = v.pathIndex + 1; i < v.path.length; i++) {
                        if (congestedEdges.has(v.path[i])) {
                            crossesCongestion = true;
                            break;
                        }
                    }
                }

                if (crossesCongestion) {
                    const currentEdgeId = v.path[v.pathIndex];
                    const edge = EDGES.find(e => e.id === currentEdgeId);
                    if (edge) {
                        v.pendingReroute = true;
                        v.lastRerouteTime = now;
                        socket.send(JSON.stringify({
                            type: "route_request",
                            payload: {
                                vehicle_id: v.id,
                                origin: edge.to,
                                destination: v.destination,
                                type: v.type,
                                selfish: v.selfish,
                                emergency: false,
                                fleet_id: v.fleet_id || ""
                            }
                        }));
                    }
                }
            }
        });
    }
}

// Interpolate coordinates along a polyline based on progress (0 to 1)
function interpolatePosition(coords, progress) {
    if (!coords || coords.length === 0) return [0, 0];
    if (coords.length === 1) return coords[0];
    if (progress <= 0) return coords[0];
    if (progress >= 1.0) return coords[coords.length - 1];

    let totalLength = 0;
    const lengths = [];
    for (let i = 0; i < coords.length - 1; i++) {
        const d = getDistance(coords[i], coords[i + 1]);
        lengths.push(d);
        totalLength += d;
    }

    if (totalLength === 0) return coords[0];

    const targetLength = progress * totalLength;
    let currentLength = 0;

    for (let i = 0; i < coords.length - 1; i++) {
        if (currentLength + lengths[i] >= targetLength) {
            const segmentProgress = (targetLength - currentLength) / lengths[i];
            const start = coords[i];
            const end = coords[i + 1];
            return [
                start[0] + (end[0] - start[0]) * segmentProgress,
                start[1] + (end[1] - start[1]) * segmentProgress
            ];
        }
        currentLength += lengths[i];
    }
    return coords[coords.length - 1];
}

function getDistance(coords1, coords2) {
    const R = 6371000; 
    const lat1 = coords1[1] * Math.PI / 180;
    const lat2 = coords2[1] * Math.PI / 180;
    const dLat = (coords2[1] - coords1[1]) * Math.PI / 180;
    const dLng = (coords2[0] - coords1[0]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getBearing(coords1, coords2) {
    const lng1 = coords1[0];
    const lat1 = coords1[1];
    const lng2 = coords2[0];
    const lat2 = coords2[1];
    const dLng = lng2 - lng1;
    const dLat = lat2 - lat1;
    return Math.atan2(dLng, dLat) * 180 / Math.PI;
}

// Helper to calculate total distance of an edge using straight-line distance
function getEdgeDistance(edgeId) {
    const coords = roadGeometries[edgeId];
    if (coords && coords.length > 1) {
        let totalLength = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            totalLength += getDistance(coords[i], coords[i + 1]);
        }
        return totalLength;
    }
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
        
        if (currentAdoptionRate > 0) {
            speed *= (1.0 + (currentAdoptionRate / 100.0));
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
    // Tell backend to remove all vehicles
    Object.keys(markers).forEach(id => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const pos = markers[id].getLngLat();
            socket.send(JSON.stringify({
                type: "update_position",
                payload: {
                    vehicle_id: id,
                    lat: pos.lat,
                    lng: pos.lng,
                    current_edge: "finished"
                }
            }));
        }
    });

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
    followedVehicleId = null;
    updateMapEdgeLoads([]);
}

// Auto-Spawning Control Loop
function startAutoSpawn() {
    if (autoSpawnInterval) clearInterval(autoSpawnInterval);
    spawnMultipleCiviliansAndFleets(3);
    autoSpawnInterval = setInterval(() => {
        spawnMultipleCiviliansAndFleets(3);
    }, 3000);
}

function stopAutoSpawn() {
    if (autoSpawnInterval) {
        clearInterval(autoSpawnInterval);
        autoSpawnInterval = null;
    }
}

function spawnMultipleCiviliansAndFleets(count) {
    for (let i = 0; i < count; i++) {
        if (Math.random() > 0.2) spawnCivilian(); // 80% chance civilian
        else spawnFleet();                        // 20% chance fleet van
    }
}

// Client-Side Telemetry Simulation Loop
function startSimulationLoop() {
    let lastTime = performance.now();
    
    function animate(currentTime) {
        requestAnimationFrame(animate); // Queue the next frame immediately
        
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

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
            
            if (currentAdoptionRate > 0) {
                speed *= (1.0 + (currentAdoptionRate / 100.0));
            }
            
            const edgeDistance = getEdgeDistance(currentEdgeId);
            let speedStep = 0.08; // fallback
            if (edgeDistance > 0) {
                // Calculate movement based on dynamic delta time (seconds)
                const dtSeconds = deltaTime / 1000.0;
                speedStep = (speed * dtSeconds) / edgeDistance;
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
                            current_edge: "finished"
                        }
                    }));
                    if (v.id === followedVehicleId) {
                        followedVehicleId = null;
                    clearRouteHighlight();
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
                    delete localVehicles[v.id];
                    return;
                }
            }

            // Interpolate position coordinate
            const fromNode = NODES[edge.from];
            const toNode = NODES[edge.to];
            const geom = roadGeometries[edge.id] || [fromNode.coords, toNode.coords];
            const interpolated = interpolatePosition(geom, v.progress);
            const lng = interpolated[0];
            const lat = interpolated[1];

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

            // Dynamic 3D Camera to follow selected vehicle
            if (followedVehicleId === v.id && map) {
                const edgeBearing = getBearing(fromNode.coords, toNode.coords);
                const timeFactor = (performance.now() / 1500);
                const dynamicPitch = 60 + Math.sin(timeFactor) * 15;
                
                map.jumpTo({
                    center: [lng, lat],
                    zoom: 16.5,
                    pitch: dynamicPitch,
                    bearing: edgeBearing
                });
                drawRouteHighlight(v.id);
            }
        });
    }
    
    requestAnimationFrame(animate);
}
