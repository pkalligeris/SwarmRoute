package websocket

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/gorilla/websocket"
	"github.com/pkalligeris/SwarmRoute/internal/graph"
	"github.com/pkalligeris/SwarmRoute/internal/karma"
	"github.com/pkalligeris/SwarmRoute/internal/orchestrator"
	"github.com/pkalligeris/SwarmRoute/internal/vehicle"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
	"github.com/redis/go-redis/v9"
)

func setupTestResources(t *testing.T) (*graph.Graph, *vehicle.VehicleManager, *karma.KarmaManager, *orchestrator.Orchestrator, *redis.Client, *miniredis.Miniredis) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	g := graph.NewGraph()
	// Add some nodes/edges for testing routing
	g.AddNode(&types.Node{ID: "A", Lat: 37.9756, Lng: 23.7348})
	g.AddNode(&types.Node{ID: "B", Lat: 37.9802, Lng: 23.7327})
	g.AddEdge(&types.Edge{ID: "A-B", From: "A", To: "B", Distance: 1000.0, MaxCapacity: 10})

	vm := vehicle.NewVehicleManager(rdb, 10*time.Minute)
	km := karma.NewKarmaManager(rdb)
	orch := orchestrator.NewOrchestrator(g, vm, km, rdb)

	return g, vm, km, orch, rdb, mr
}

func TestWebSocketUpgrade(t *testing.T) {
	_, vm, _, orch, rdb, mr := setupTestResources(t)
	defer mr.Close()
	defer rdb.Close()

	h := NewWSHandler(orch, vm)

	server := httptest.NewServer(http.HandlerFunc(h.ServeHTTP))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Expected status switching protocols, got %d", resp.StatusCode)
	}

	// Give it a tiny bit of time to register the client connection
	time.Sleep(50 * time.Millisecond)

	if active := h.ActiveClients(); active != 1 {
		t.Errorf("Expected 1 active client, got %d", active)
	}
}

func TestWebSocketRouteRequest(t *testing.T) {
	_, vm, _, orch, rdb, mr := setupTestResources(t)
	defer mr.Close()
	defer rdb.Close()

	h := NewWSHandler(orch, vm)

	server := httptest.NewServer(http.HandlerFunc(h.ServeHTTP))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	req := types.RouteRequest{
		VehicleID:   "v1",
		Origin:      "A",
		Destination: "B",
		Type:        types.Civilian,
	}

	msg := types.WebSocketMessage{
		Type:    "route_request",
		Payload: req,
	}

	err = conn.WriteJSON(msg)
	if err != nil {
		t.Fatalf("Failed to write JSON message: %v", err)
	}

	var respMsg types.WebSocketMessage
	err = conn.ReadJSON(&respMsg)
	if err != nil {
		t.Fatalf("Failed to read JSON message: %v", err)
	}

	if respMsg.Type != "route_response" {
		t.Fatalf("Expected response type 'route_response', got '%s'", respMsg.Type)
	}

	// Since payload is deserialized as interface{}, let's marshal and unmarshal it back to RouteResponse
	payloadBytes, err := json.Marshal(respMsg.Payload)
	if err != nil {
		t.Fatalf("Failed to marshal response payload: %v", err)
	}

	var routeResp types.RouteResponse
	err = json.Unmarshal(payloadBytes, &routeResp)
	if err != nil {
		t.Fatalf("Failed to unmarshal response payload: %v", err)
	}

	if routeResp.VehicleID != "v1" {
		t.Errorf("Expected vehicle ID 'v1', got '%s'", routeResp.VehicleID)
	}

	if len(routeResp.Path.Edges) != 1 || routeResp.Path.Edges[0] != "A-B" {
		t.Errorf("Expected route path with edge 'A-B', got edges: %v", routeResp.Path.Edges)
	}
}

func TestWebSocketBroadcast(t *testing.T) {
	_, vm, _, orch, rdb, mr := setupTestResources(t)
	defer mr.Close()
	defer rdb.Close()

	h := NewWSHandler(orch, vm)

	server := httptest.NewServer(http.HandlerFunc(h.ServeHTTP))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	// Wait for connection to register
	time.Sleep(50 * time.Millisecond)

	// Register a vehicle in VehicleManager
	v := &types.Vehicle{
		ID:          "v_test",
		Type:        types.Civilian,
		Origin:      "A",
		Destination: "B",
		CurrentEdge: "A-B",
		Lat:         37.9756,
		Lng:         23.7348,
	}

	err = vm.RegisterVehicle(context.Background(), v)
	if err != nil {
		t.Fatalf("Failed to register vehicle: %v", err)
	}

	// Trigger broadcast manually
	err = h.BroadcastTelemetry(context.Background())
	if err != nil {
		t.Fatalf("BroadcastTelemetry failed: %v", err)
	}

	var respMsg types.WebSocketMessage
	err = conn.ReadJSON(&respMsg)
	if err != nil {
		t.Fatalf("Failed to read JSON message: %v", err)
	}

	if respMsg.Type != "vehicle_positions" {
		t.Fatalf("Expected message type 'vehicle_positions', got '%s'", respMsg.Type)
	}

	payloadBytes, err := json.Marshal(respMsg.Payload)
	if err != nil {
		t.Fatalf("Failed to marshal response payload: %v", err)
	}

	var positions []types.VehiclePosition
	err = json.Unmarshal(payloadBytes, &positions)
	if err != nil {
		t.Fatalf("Failed to unmarshal response payload: %v", err)
	}

	if len(positions) != 1 {
		t.Fatalf("Expected 1 vehicle position, got %d", len(positions))
	}

	if positions[0].ID != "v_test" {
		t.Errorf("Expected vehicle ID 'v_test', got '%s'", positions[0].ID)
	}

	if positions[0].Lat != 37.9756 || positions[0].Lng != 23.7348 {
		t.Errorf("Expected coordinates (37.9756, 23.7348), got (%f, %f)", positions[0].Lat, positions[0].Lng)
	}
}
