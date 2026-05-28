package graph

import (
	"github.com/pkalligeris/SwarmRoute/pkg/types"
)

// LoadAthensGrid populates the graph with the real layout and coordinates of downtown Athens
func (g *Graph) LoadAthensGrid() {
	nodes := []*types.Node{
		{ID: "A", Lat: 37.9756, Lng: 23.7348}, // Syntagma
		{ID: "B", Lat: 37.9841, Lng: 23.7280}, // Omonia
		{ID: "C", Lat: 37.9761, Lng: 23.7257}, // Monastiraki
		{ID: "D", Lat: 37.9802, Lng: 23.7327}, // Panepistimio
		{ID: "E", Lat: 37.9777, Lng: 23.7431}, // Kolonaki
		{ID: "F", Lat: 37.9760, Lng: 23.7481}, // Evangelismos
		{ID: "G", Lat: 37.9730, Lng: 23.7300}, // Plaka
		{ID: "H", Lat: 37.9785, Lng: 23.7115}, // Kerameikos
		{ID: "I", Lat: 37.9708, Lng: 23.7214}, // Thissio/Acropolis
		{ID: "J", Lat: 37.9680, Lng: 23.7180}, // Petralona
	}

	for _, n := range nodes {
		g.AddNode(n)
	}

	edgesRaw := []struct {
		ID   string
		From string
		To   string
		Cap  int
		Cons []types.VehicleType
	}{
		// Syntagma <-> Panepistimio (via Stadiou / Panepistimiou)
		{ID: "A-D", From: "A", To: "D", Cap: 15},
		{ID: "D-A", From: "D", To: "A", Cap: 15},
		// Panepistimio <-> Omonia
		{ID: "D-B", From: "D", To: "B", Cap: 15},
		{ID: "B-D", From: "B", To: "D", Cap: 15},
		// Omonia <-> Monastiraki (via Athinas)
		{ID: "B-C", From: "B", To: "C", Cap: 12},
		{ID: "C-B", From: "C", To: "B", Cap: 12},
		// Syntagma <-> Monastiraki (via Ermou)
		{ID: "A-C", From: "A", To: "C", Cap: 10},
		{ID: "C-A", From: "C", To: "A", Cap: 10},
		// Syntagma <-> Plaka
		{ID: "A-G", From: "A", To: "G", Cap: 8, Cons: []types.VehicleType{types.Civilian, types.Delivery}}, // Restricted for Heavy
		{ID: "G-A", From: "G", To: "A", Cap: 8, Cons: []types.VehicleType{types.Civilian, types.Delivery}},
		// Plaka <-> Thissio
		{ID: "G-I", From: "G", To: "I", Cap: 8, Cons: []types.VehicleType{types.Civilian, types.Delivery}},
		{ID: "I-G", From: "I", To: "G", Cap: 8, Cons: []types.VehicleType{types.Civilian, types.Delivery}},
		// Thissio <-> Monastiraki
		{ID: "I-C", From: "I", To: "C", Cap: 10},
		{ID: "C-I", From: "C", To: "I", Cap: 10},
		// Monastiraki <-> Kerameikos
		{ID: "C-H", From: "C", To: "H", Cap: 15},
		{ID: "H-C", From: "H", To: "C", Cap: 15},
		// Omonia <-> Kerameikos (via Pireos)
		{ID: "B-H", From: "B", To: "H", Cap: 20},
		{ID: "H-B", From: "H", To: "B", Cap: 20},
		// Syntagma <-> Kolonaki
		{ID: "A-E", From: "A", To: "E", Cap: 10},
		{ID: "E-A", From: "E", To: "A", Cap: 10},
		// Kolonaki <-> Evangelismos
		{ID: "E-F", From: "E", To: "F", Cap: 10},
		{ID: "F-E", From: "F", To: "E", Cap: 10},
		// Syntagma <-> Evangelismos (via Vasilissis Sofias)
		{ID: "A-F", From: "A", To: "F", Cap: 15},
		{ID: "F-A", From: "F", To: "A", Cap: 15},
		// Thissio <-> Petralona
		{ID: "I-J", From: "I", To: "J", Cap: 10},
		{ID: "J-I", From: "J", To: "I", Cap: 10},
		// Petralona <-> Kerameikos
		{ID: "J-H", From: "J", To: "H", Cap: 10},
		{ID: "H-J", From: "H", To: "J", Cap: 10},
	}

	for _, er := range edgesRaw {
		fromNode := g.Nodes[types.NodeID(er.From)]
		toNode := g.Nodes[types.NodeID(er.To)]
		dist := HaversineDistance(fromNode.Lat, fromNode.Lng, toNode.Lat, toNode.Lng)

		g.AddEdge(&types.Edge{
			ID:          types.EdgeID(er.ID),
			From:        types.NodeID(er.From),
			To:          types.NodeID(er.To),
			Distance:    dist,
			MaxCapacity: er.Cap,
			CurrentLoad: 0,
			Constraints: er.Cons,
		})
	}
}
