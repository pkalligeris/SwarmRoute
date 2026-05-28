package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pkalligeris/SwarmRoute/internal/graph"
	"github.com/pkalligeris/SwarmRoute/internal/iot"
	"github.com/pkalligeris/SwarmRoute/internal/karma"
	"github.com/pkalligeris/SwarmRoute/internal/orchestrator"
	"github.com/pkalligeris/SwarmRoute/internal/vehicle"
	"github.com/pkalligeris/SwarmRoute/internal/websocket"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr: getEnv("REDIS_URL", "localhost:6379"),
	})

	// Test Redis connection
	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Connected to Redis successfully")

	// Initialize components
	graphEngine := graph.NewGraph()
	graphEngine.LoadAthensGrid()
	vehicleManager := vehicle.NewVehicleManager(redisClient, 10*time.Minute)
	karmaManager := karma.NewKarmaManager(redisClient)
	routingOrchestrator := orchestrator.NewOrchestrator(graphEngine, vehicleManager, karmaManager, redisClient)
	_ = iot.NewSensorManager(graphEngine, redisClient) // instantiated and wired
	wsHandler := websocket.NewWSHandler(routingOrchestrator, vehicleManager)

	// Setup HTTP server
	port := getEnv("SERVER_PORT", "8080")
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// WebSocket endpoint
	mux.Handle("/ws", wsHandler)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Start telemetry broadcast loop (100ms updates)
	broadcastCtx, broadcastCancel := context.WithCancel(context.Background())
	defer broadcastCancel()

	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-broadcastCtx.Done():
				return
			case <-ticker.C:
				// Synchronize active edge loads from Redis to Graph in-memory
				edgeIDs := graphEngine.GetEdgeIDs()

				for _, id := range edgeIDs {
					vehicles, err := vehicleManager.GetVehiclesOnEdge(broadcastCtx, id)
					if err == nil {
						_ = graphEngine.SetEdgeLoad(id, len(vehicles))
					}
				}

				if err := wsHandler.BroadcastTelemetry(broadcastCtx); err != nil {
					log.Printf("Error broadcasting telemetry: %v", err)
				}
			}
		}
	}()

	// Graceful shutdown
	go func() {
		log.Printf("Server starting on port %s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Stop telemetry broadcast loop
	broadcastCancel()

	// Graceful shutdown with timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	// Close Redis connection
	if err := redisClient.Close(); err != nil {
		log.Printf("Error closing Redis: %v", err)
	}

	log.Println("Server stopped")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
