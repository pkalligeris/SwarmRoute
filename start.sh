#!/bin/bash

echo "Starting Redis via docker-compose..."
docker-compose up -d

echo "Starting Go backend server..."
go run cmd/server/main.go &
BACKEND_PID=$!

echo "Starting Python frontend server..."
(cd frontend && python3 -m http.server 8081) &
FRONTEND_PID=$!

echo "========================================="
echo "🚀 SwarmRoute is running!"
echo "🌐http://localhost:8081"

echo "🛑 Press Ctrl+C to stop all services"
echo "========================================="

# Trap SIGINT (Ctrl+C) and SIGTERM to kill background processes and stop docker safely
trap "echo -e '\nStopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker-compose stop; exit 0" SIGINT SIGTERM

wait