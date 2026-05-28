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

// App State
let map = null;
let socket = null;
let markers = {}; // vehicle_id -> mapbox marker
let localVehicles = {}; // vehicle_id -> vehicle state
let currentEdgeLoads = {}; // edge_id -> vehicle count
let mapboxToken = localStorage.getItem("mapbox_token") || "";
let roadGeometries = {};
let currentAdoptionRate = 0;
let followedVehicleId = null;

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

    const adoptionSlider = document.getElementById("adoption-rate");
    const adoptionVal = document.getElementById("adoption-rate-val");
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
        if (pos.current_edge === "finished") return;
        activeIds.add(pos.id);
        
        let marker = markers[pos.id];
        if (!marker) {
            const el = document.createElement('div');
            el.className = 'vehicle-marker';
            
            if (pos.type === 2) { // Emergency
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

            // Click to follow camera
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (followedVehicleId === pos.id) {
                    followedVehicleId = null;
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
                }
            });
                
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
}

function triggerIoTReRoute(force = false) {
    if (!force) {
        const iotToggle = document.getElementById("iot-toggle");
        if (iotToggle && !iotToggle.checked) return;
    }

    let needsReroute = force;
    if (!needsReroute) {
        EDGES.forEach(edge => {
            const load = currentEdgeLoads[edge.id] || 0;
            if (edge.cap > 0 && load / edge.cap >= 0.8) {
                needsReroute = true;
            }
        });
    }

    if (needsReroute) {
        Object.keys(localVehicles).forEach(id => {
            const v = localVehicles[id];
            if ((v.type === 0 || v.type === 1) && v.path && v.pathIndex < v.path.length) {
                const currentEdgeId = v.path[v.pathIndex];
                const edge = EDGES.find(e => e.id === currentEdgeId);
                if (edge) {
                    v.pendingReroute = true;
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
        });
    }
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
    let lastTime = performance.now();

    function animate(currentTime) {
        requestAnimationFrame(animate);

        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

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
            
            if (typeof adoptionSlider !== 'undefined' && adoptionSlider) {
                const adoptionRate = parseInt(adoptionSlider.value) || 0;
                speed *= (1.0 + (adoptionRate / 100.0));
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
                v.progress = 0;
                v.pathIndex++;

                if (v.pathIndex >= v.path.length) {
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
            }
        });
    }

    requestAnimationFrame(animate);
}
