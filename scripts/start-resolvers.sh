#!/bin/bash

# Start multiple resolver instances with different configurations

echo "🚀 Starting multiple resolver instances..."

# Function to start resolver
start_resolver() {
    local PORT=$1
    local ENV_FILE=$2
    local NAME=$3
    
    echo "Starting $NAME on port $PORT..."
    
    # Export environment variables from the env file
    export $(cat backend/resolver/$ENV_FILE | grep -v '^#' | xargs)
    export RESOLVER_PORT=$PORT
    export RESOLVER_NAME=$NAME
    
    # Start resolver in background
    cd backend/resolver && npm run dev &
    
    # Store PID
    echo $! >> .resolver-pids
    
    cd ../..
    sleep 2
}

# Clean up any existing PIDs file
rm -f .resolver-pids

# Start Resolver 1 (Main)
start_resolver 4001 .env "Resolver-1"

# Start Resolver 2
start_resolver 4002 .env.resolver2 "Resolver-2"

# Start Resolver 3
start_resolver 4003 .env.resolver3 "Resolver-3"

echo ""
echo "✅ All resolvers started!"
echo ""
echo "Resolver endpoints:"
echo "  - Resolver 1: http://localhost:4001"
echo "  - Resolver 2: http://localhost:4002"
echo "  - Resolver 3: http://localhost:4003"
echo ""
echo "To stop all resolvers: ./scripts/stop-resolvers.sh"