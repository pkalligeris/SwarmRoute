package websocket

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/pkalligeris/SwarmRoute/internal/orchestrator"
	"github.com/pkalligeris/SwarmRoute/internal/vehicle"
	"github.com/pkalligeris/SwarmRoute/pkg/types"
)

type WSHandler struct {
	upgrader     websocket.Upgrader
	clients      map[*websocket.Conn]bool
	clientsMu    sync.RWMutex
	orchestrator *orchestrator.Orchestrator
	vehicles     *vehicle.VehicleManager
}

func NewWSHandler(orch *orchestrator.Orchestrator, vm *vehicle.VehicleManager) *WSHandler {
	return &WSHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		clients:      make(map[*websocket.Conn]bool),
		orchestrator: orch,
		vehicles:     vm,
	}
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	h.clientsMu.Lock()
	h.clients[conn] = true
	h.clientsMu.Unlock()

	defer func() {
		h.clientsMu.Lock()
		delete(h.clients, conn)
		h.clientsMu.Unlock()
		conn.Close()
	}()

	for {
		var msg types.WebSocketMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			break
		}

		h.handleMessage(conn, msg)
	}
}

func (h *WSHandler) handleMessage(conn *websocket.Conn, msg types.WebSocketMessage) {
	switch msg.Type {
	case "route_request":
		payloadBytes, err := json.Marshal(msg.Payload)
		if err != nil {
			return
		}

		var req types.RouteRequest
		if err := json.Unmarshal(payloadBytes, &req); err != nil {
			return
		}

		resp, err := h.orchestrator.RequestRoute(context.Background(), req)
		if err != nil {
			_ = conn.WriteJSON(types.WebSocketMessage{
				Type:    "error",
				Payload: err.Error(),
			})
			return
		}

		_ = conn.WriteJSON(types.WebSocketMessage{
			Type:    "route_response",
			Payload: resp,
		})

	case "register_vehicle":
		payloadBytes, err := json.Marshal(msg.Payload)
		if err != nil {
			return
		}

		var v types.Vehicle
		if err := json.Unmarshal(payloadBytes, &v); err != nil {
			return
		}

		_ = h.vehicles.RegisterVehicle(context.Background(), &v)

	case "update_position":
		payloadBytes, err := json.Marshal(msg.Payload)
		if err != nil {
			return
		}

		var update struct {
			VehicleID   types.VehicleID `json:"vehicle_id"`
			Lat         float64         `json:"lat"`
			Lng         float64         `json:"lng"`
			CurrentEdge types.EdgeID    `json:"current_edge"`
		}
		if err := json.Unmarshal(payloadBytes, &update); err != nil {
			return
		}

		_ = h.vehicles.UpdatePosition(context.Background(), update.VehicleID, update.Lat, update.Lng, update.CurrentEdge)
	}
}

func (h *WSHandler) ActiveClients() int {
	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()
	return len(h.clients)
}

func (h *WSHandler) BroadcastTelemetry(ctx context.Context) error {
	vehicles, err := h.vehicles.GetAllVehicles(ctx)
	if err != nil {
		return err
	}

	// Use a custom struct to ensure CurrentEdge is included in the JSON if needed,
	// and completely filter out any finished vehicles from the telemetry stream.
	type broadcastPos struct {
		ID          types.VehicleID   `json:"id"`
		Lat         float64           `json:"lat"`
		Lng         float64           `json:"lng"`
		Type        types.VehicleType `json:"type"`
		CurrentEdge types.EdgeID      `json:"current_edge"`
	}

	var positions []broadcastPos
	for _, v := range vehicles {
		if v.CurrentEdge == "finished" {
			continue
		}

		positions = append(positions, broadcastPos{
			ID:          v.ID,
			Lat:         v.Lat,
			Lng:         v.Lng,
			Type:        v.Type,
			CurrentEdge: v.CurrentEdge,
		})
	}

	msg := types.WebSocketMessage{
		Type:    "vehicle_positions",
		Payload: positions,
	}

	h.clientsMu.RLock()
	defer h.clientsMu.RUnlock()

	for conn := range h.clients {
		_ = conn.WriteJSON(msg)
	}

	return nil
}
