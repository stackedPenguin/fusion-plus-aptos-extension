#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "🚀 Fusion+ Cross-Chain Swap System Manager"
echo "=========================================="

# Function to stop all services
stop_services() {
    echo "🛑 Stopping existing services..."
    
    # Kill processes by port
    echo "   Stopping services on ports 3000, 3001, 3002..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Order Engine (port 3001)"
    lsof -ti:3002 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Resolver (port 3002)"
    lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Frontend (port 3000)"
    
    # Also kill any node processes related to our services
    pkill -f "node.*order-engine" 2>/dev/null
    pkill -f "node.*resolver" 2>/dev/null
    pkill -f "react-scripts start" 2>/dev/null
    
    # Clean up log files
    echo "   Cleaning up old logs..."
    rm -f "$PROJECT_ROOT/order-engine.log" "$PROJECT_ROOT/resolver.log"
    
    echo "   ✅ All services stopped"
    echo ""
}

# Function to check if a port is in use
check_port() {
    lsof -ti:$1 > /dev/null 2>&1
    return $?
}

# Handle script arguments
if [ "$1" = "stop" ]; then
    stop_services
    exit 0
fi

# Stop existing services first
stop_services

# Wait a moment for ports to be released
sleep 2

# Start services
echo "🚀 Starting services..."
echo ""

# Create PID file for tracking
PID_FILE="$PROJECT_ROOT/.fusion-plus-pids"
> "$PID_FILE"

# Start Order Engine
echo "1. Starting Order Engine (port 3001)..."
cd "$PROJECT_ROOT/backend/order-engine"
npm run dev > "$PROJECT_ROOT/order-engine.log" 2>&1 &
ORDER_ENGINE_PID=$!
echo "$ORDER_ENGINE_PID" >> "$PID_FILE"
echo "   Order Engine PID: $ORDER_ENGINE_PID"

# Wait and check if order engine started
sleep 3
if check_port 3001; then
    echo "   ✅ Order Engine started successfully"
else
    echo "   ❌ Order Engine failed to start. Check order-engine.log"
    exit 1
fi

# Start Resolver
echo ""
echo "2. Starting Resolver Service (port 3002)..."
cd "$PROJECT_ROOT/backend/resolver"
npm run dev > "$PROJECT_ROOT/resolver.log" 2>&1 &
RESOLVER_PID=$!
echo "$RESOLVER_PID" >> "$PID_FILE"
echo "   Resolver PID: $RESOLVER_PID"

# Wait and check if resolver started
sleep 3
if check_port 3002; then
    echo "   ✅ Resolver started successfully"
else
    echo "   ❌ Resolver failed to start. Check resolver.log"
    exit 1
fi

# Start Frontend
echo ""
echo "3. Starting Frontend (port 3000)..."
cd "$PROJECT_ROOT/frontend"
npm start &
FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "$PID_FILE"
echo "   Frontend PID: $FRONTEND_PID"

# Create stop script
STOP_SCRIPT="$PROJECT_ROOT/stop-all.sh"
cat > "$STOP_SCRIPT" << EOF
#!/bin/bash
echo "Stopping Fusion+ services..."
$SCRIPT_DIR/start-all.sh stop
EOF
chmod +x "$STOP_SCRIPT"

echo ""
echo "=========================================="
echo "✅ All services started!"
echo ""
echo "📊 Service URLs:"
echo "   - Frontend: http://localhost:3000"
echo "   - Order Engine: http://localhost:3001"
echo "   - Resolver: http://localhost:3002"
echo ""
echo "📋 Logs:"
echo "   - Order Engine: tail -f $PROJECT_ROOT/order-engine.log"
echo "   - Resolver: tail -f $PROJECT_ROOT/resolver.log"
echo ""
echo "🛑 To stop all services:"
echo "   ./stop-all.sh"
echo "   OR"
echo "   ./scripts/start-all.sh stop"
echo ""
echo "💡 Test Flow:"
echo "   1. Connect both MetaMask (Sepolia) and Petra (Testnet) wallets"
echo "   2. Enter amount to swap (e.g., 0.001 ETH)"
echo "   3. Click 'Create Swap Order'"
echo "   4. Watch real-time updates as resolver processes your order"
echo ""

# Trap to handle Ctrl+C
trap 'echo ""; echo "Shutting down services..."; stop_services; exit' INT

# Keep script running
echo "Press Ctrl+C to stop all services..."
wait