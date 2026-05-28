package types

import "time"

// NodeID represents a unique identifier for a graph node
type NodeID string

// EdgeID represents a unique identifier for a graph edge
type EdgeID string

// VehicleID represents a unique identifier for a vehicle
type VehicleID string

// SensorID represents a unique identifier for an IoT sensor
type SensorID string

// VehicleType represents different categories of vehicles
type VehicleType int

const (
	Civilian VehicleType = iota
	Delivery
	Emergency
	HeavyTransport
)

// String returns the string representation of VehicleType
func (vt VehicleType) String() string {
	switch vt {
	case Civilian:
		return "civilian"
	case Delivery:
		return "delivery"
	case Emergency:
		return "emergency"
	case HeavyTransport:
		return "heavy_transport"
	default:
		return "unknown"
	}
}

// Node represents a point in the road network
type Node struct {
	ID  NodeID  `json:"id"`
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// Edge represents a road segment between two nodes
type Edge struct {
	ID          EdgeID        `json:"id"`
	From        NodeID        `json:"from"`
	To          NodeID        `json:"to"`
	Distance    float64       `json:"distance"`     // in meters
	MaxCapacity int           `json:"max_capacity"` // max vehicles
	CurrentLoad int           `json:"current_load"` // current vehicles
	Constraints []VehicleType `json:"constraints"`  // allowed vehicle types
}

// Vehicle represents a vehicle in the system
type Vehicle struct {
	ID          VehicleID   `json:"id"`
	Type        VehicleType `json:"type"`
	Origin      NodeID      `json:"origin"`
	Destination NodeID      `json:"destination"`
	CurrentEdge EdgeID      `json:"current_edge"`
	Priority    int         `json:"priority"`    // 0 = highest (emergency)
	FlowPoints  int         `json:"flow_points"` // karma points
	Lat         float64     `json:"lat"`
	Lng         float64     `json:"lng"`
	FleetID     string      `json:"fleet_id"`
}

// Path represents a route through the graph
type Path struct {
	Edges         []EdgeID `json:"edges"`
	TotalDistance float64  `json:"total_distance"`
	EstimatedTime float64  `json:"estimated_time"` // in seconds
}

// RouteRequest represents a request for routing
type RouteRequest struct {
	VehicleID   VehicleID   `json:"vehicle_id"`
	Origin      NodeID      `json:"origin"`
	Destination NodeID      `json:"destination"`
	Type        VehicleType `json:"type"`
	Emergency   bool        `json:"emergency"`
	Selfish     bool        `json:"selfish"`
	FleetID     string      `json:"fleet_id"`
}

// RouteResponse represents the response to a routing request
type RouteResponse struct {
	VehicleID        VehicleID `json:"vehicle_id"`
	Path             Path      `json:"path"`
	FlowPointsEarned int       `json:"flow_points_earned"`
}

// SensorType represents different types of IoT sensors
type SensorType int

const (
	TrafficCamera SensorType = iota
	InductionLoop
	SpeedRadar
)

// Sensor represents an IoT traffic sensor
type Sensor struct {
	ID       SensorID   `json:"id"`
	Location NodeID     `json:"location"`
	Type     SensorType `json:"type"`
}

// SensorReading represents data from an IoT sensor
type SensorReading struct {
	SensorID     SensorID  `json:"sensor_id"`
	Timestamp    time.Time `json:"timestamp"`
	VehicleCount int       `json:"vehicle_count"`
	AvgSpeed     float64   `json:"avg_speed"` // km/h
}

// WebSocketMessage represents messages sent over WebSocket
type WebSocketMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// VehiclePosition represents a vehicle's current position for broadcasting
type VehiclePosition struct {
	ID   VehicleID   `json:"id"`
	Lat  float64     `json:"lat"`
	Lng  float64     `json:"lng"`
	Type VehicleType `json:"type"`
}
