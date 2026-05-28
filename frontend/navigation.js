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
    { id: "E-F", from: "E", to: "F", cap: 10 },
    { id: "F-E", from: "F", to: "E", cap: 10 },
    { id: "A-F", from: "A", to: "F", cap: 15 },
    { id: "F-A", from: "F", to: "A", cap: 15 },
    { id: "I-J", from: "I", to: "J", cap: 10 },
    { id: "J-I", from: "J", to: "I", cap: 10 },
    { id: "J-H", from: "J", to: "H", cap: 10 },
    { id: "H-J", from: "H", to: "J", cap: 10 }
];

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

// App State
let map = null;
let socket = null;
let markers = {}; // vehicle_id -> mapbox marker
let localVehicles = {}; // vehicle_id -> vehicle state
let currentEdgeLoads = {}; // edge_id -> vehicle count
let mapboxToken = localStorage.getItem("mapbox_token") || "";
let isUserNavigating = false;
let lastSpokenInstruction = "";
let roadGeometries = {};

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

// UI Elements
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
                8, "#ef4444"  // Red
            ],
            "line-width": 4,
            "line-opacity": 0.5 // Dimmer ambient street loads to emphasize navigation path
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
    const activeIds = new Set();

    positions.forEach(pos => {
        activeIds.add(pos.id);
        
        let marker = markers[pos.id];
        if (!marker) {
            const el = document.createElement('div');
            el.className = 'vehicle-marker';
            
            if (pos.id === "user_nav_vehicle") {
                el.classList.add('user-marker');
                el.innerHTML = '<i class="fa-solid fa-location-arrow"></i>';
            } else if (pos.type === 2) { // Emergency
                el.classList.add('emergency-marker');
                el.innerHTML = '<i class="fa-solid fa-truck-medical"></i>';
            } else if (pos.type === 1) { // Delivery
                el.classList.add('fleet-marker');
                el.innerHTML = '<i class="fa-solid fa-box"></i>';
            } else { // Civilian
                el.classList.add('swarm-marker');
                el.innerHTML = '<i class="fa-solid fa-car"></i>';
            }

            marker = new mapboxgl.Marker(el)
                .setLngLat([pos.lng, pos.lat])
                .addTo(map);
                
            markers[pos.id] = marker;
        } else {
            marker.setLngLat([pos.lng, pos.lat]);
        }
    });

    Object.keys(markers).forEach(id => {
        if (!activeIds.has(id)) {
            markers[id].remove();
            delete markers[id];
        }
    });

    updateMapEdgeLoads(positions);
}

// Calculate street network loads
function updateMapEdgeLoads(positions) {
    if (!map || !map.getSource('streets')) return;

    currentEdgeLoads = {};
    EDGES.forEach(e => { currentEdgeLoads[e.id] = 0; });

    positions.forEach(pos => {
        const vState = localVehicles[pos.id];
        if (vState && vState.path && vState.pathIndex < vState.path.length) {
            const edgeId = vState.path[vState.pathIndex];
            if (currentEdgeLoads[edgeId] !== undefined) {
                currentEdgeLoads[edgeId]++;
            }
        }
    });

    const features = EDGES.map(edge => {
        const coords = roadGeometries[edge.id] || [NODES[edge.from].coords, NODES[edge.to].coords];
        const load = currentEdgeLoads[edge.id] || 0;
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
}

// Highlight the entire route path on the map with custom glow styles
function drawRouteHighlight(pathEdges, isEmergency) {
    if (!map) return;
    
    const coordinates = [];
    pathEdges.forEach(edgeId => {
        const geom = roadGeometries[edgeId];
        if (geom) {
            coordinates.push(...geom);
        } else {
            const edge = EDGES.find(e => e.id === edgeId);
            if (edge) {
                const fromNode = NODES[edge.from];
                const toNode = NODES[edge.to];
                if (coordinates.length === 0) {
                    coordinates.push(fromNode.coords);
                }
                coordinates.push(toNode.coords);
            }
        }
    });

    const geojson = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        }
    };

    const color = isEmergency ? "#ec4899" : "#00ffff"; // neon-pink for emergency priority, neon-cyan otherwise
    
    if (map.getSource('route-path')) {
        map.getSource('route-path').setData(geojson);
    } else {
        map.addSource('route-path', {
            "type": "geojson",
            "data": geojson
        });
    }

    // Glowing thick layer
    if (map.getLayer('route-line-glow')) {
        map.setPaintProperty('route-line-glow', 'line-color', color);
    } else {
        map.addLayer({
            "id": "route-line-glow",
            "type": "line",
            "source": "route-path",
            "layout": {
                "line-join": "round",
                "line-cap": "round"
            },
            "paint": {
                "line-color": color,
                "line-width": 8,
                "line-opacity": 0.8,
                "line-blur": 3
            }
        });
    }

    // Sharp central core layer
    if (map.getLayer('route-line')) {
        map.setPaintProperty('route-line', 'line-color', color);
    } else {
        map.addLayer({
            "id": "route-line",
            "type": "line",
            "source": "route-path",
            "layout": {
                "line-join": "round",
                "line-cap": "round"
            },
            "paint": {
                "line-color": "#ffffff",
                "line-width": 3,
                "line-opacity": 0.9
            }
        });
    }
}

function clearRouteHighlight() {
    if (!map) return;
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getLayer('route-line-glow')) map.removeLayer('route-line-glow');
    if (map.getSource('route-path')) map.removeSource('route-path');
}

function handleRouteResponse(resp) {
    if (resp.vehicle_id !== "user_nav_vehicle") return;
    
    const v = localVehicles[resp.vehicle_id];
    if (!v) return;

    v.path = resp.path.edges;
    v.pathIndex = 0;
    v.progress = 0;

    // Highlight the path
    drawRouteHighlight(v.path, resp.emergency);
}

// Distance Calculation (meters)
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

// Bearing Calculation (degrees)
function getBearing(coords1, coords2) {
    const lng1 = coords1[0];
    const lat1 = coords1[1];
    const lng2 = coords2[0];
    const lat2 = coords2[1];
    
    const dLng = lng2 - lng1;
    const dLat = lat2 - lat1;
    
    return Math.atan2(dLng, dLat) * 180 / Math.PI;
}

// Turn instruction generation
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

// Navigation HUD updates & voice assistance
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
    
    speakInstruction(instructionObj.text);
    
    let totalDistRemaining = 0;
    const currEdge = EDGES.find(e => e.id === currentEdgeId);
    if (currEdge) {
        const fromNode = NODES[currEdge.from];
        const toNode = NODES[currEdge.to];
        const edgeLen = getDistance(fromNode.coords, toNode.coords);
        totalDistRemaining += edgeLen * (1 - v.progress);
    }
    
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
        const speed = v.type === 2 ? 24 : 12;
        const etaSeconds = Math.round(totalDistRemaining / speed);
        etaEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${etaSeconds} s remaining`;
    }
}

// Speak turn instructions out loud
function speakInstruction(text) {
    if (!text || text === lastSpokenInstruction) return;
    lastSpokenInstruction = text;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// Start user navigation
function startUserNavigation(origin, dest, isSelfish, isEmergency) {
    if (localVehicles["user_nav_vehicle"]) {
        if (markers["user_nav_vehicle"]) {
            markers["user_nav_vehicle"].remove();
            delete markers["user_nav_vehicle"];
        }
        delete localVehicles["user_nav_vehicle"];
    }
    
    lastSpokenInstruction = "";
    
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
        
        const instructionEl = document.getElementById("hud-instruction");
        const distanceEl = document.getElementById("hud-distance");
        const etaEl = document.getElementById("hud-eta");
        if (instructionEl) instructionEl.textContent = "Calculating route...";
        if (distanceEl) distanceEl.innerHTML = `<i class="fa-solid fa-route"></i> -- m`;
        if (etaEl) etaEl.innerHTML = `<i class="fa-solid fa-clock"></i> -- s remaining`;
    }
    
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

// Stop user navigation
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
    
    clearRouteHighlight();
    
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

// Helper to calculate total distance of an edge using geometric coords or straight-line distance
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

// Client-Side Telemetry Simulation Loop
function startSimulationLoop() {
    setInterval(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        Object.keys(localVehicles).forEach(id => {
            const v = localVehicles[id];
            if (!v || v.path.length === 0) return;

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
                v.progress = 0;
                v.pathIndex++;

                if (v.pathIndex >= v.path.length) {
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

            const fromNode = NODES[edge.from];
            const toNode = NODES[edge.to];
            const geom = roadGeometries[edge.id] || [fromNode.coords, toNode.coords];
            const interpolated = interpolatePosition(geom, v.progress);
            const lng = interpolated[0];
            const lat = interpolated[1];

            v.lat = lat;
            v.lng = lng;

            socket.send(JSON.stringify({
                type: "update_position",
                payload: {
                    vehicle_id: v.id,
                    lat: lat,
                    lng: lng,
                    current_edge: edge.id
                }
            }));

            // GPS Camera Follow Mode
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
