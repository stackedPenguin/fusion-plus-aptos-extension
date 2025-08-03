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
    echo "   Stopping services on ports 3000, 3001, 3002, 4001, 4002, 4003..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Order Engine (port 3001)"
    lsof -ti:3002 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Resolver (port 3002)"
    lsof -ti:4001 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Resolver 1 (port 4001)"
    lsof -ti:4002 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Resolver 2 (port 4002)"
    lsof -ti:4003 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Resolver 3 (port 4003)"
    lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "   ✓ Stopped Frontend (port 3000)"
    
    # Also kill any node processes related to our services
    pkill -f "node.*order-engine" 2>/dev/null
    pkill -f "node.*resolver" 2>/dev/null
    pkill -f "react-scripts start" 2>/dev/null
    
    # Clean up log files
    echo "   Cleaning up old logs..."
    rm -f "$PROJECT_ROOT/order-engine.log" "$PROJECT_ROOT/resolver*.log"
    
    # Clean up resolver PID file
    rm -f "$PROJECT_ROOT/.resolver-pids"
    
    echo "   ✅ All services stopped"
    echo ""
}

# Function to check if a port is in use
check_port() {
    # Check multiple ways to ensure port is detected
    if lsof -i:$1 2>/dev/null | grep -q LISTEN; then
        return 0
    elif netstat -an 2>/dev/null | grep "[:.]$1 " | grep -q LISTEN; then
        return 0
    elif ss -tln 2>/dev/null | grep -q ":$1 "; then
        return 0
    else
        return 1
    fi
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
echo "   Waiting for Order Engine to start..."
for i in {1..20}; do
    if check_port 3001; then
        echo "   ✅ Order Engine started successfully"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "   ❌ Order Engine failed to start. Check order-engine.log"
        echo "   Debug: Checking processes..."
        ps aux | grep -E "order-engine|3001" | grep -v grep
        echo "   Debug: Checking ports..."
        lsof -i:3001 || netstat -an | grep 3001
        exit 1
    fi
    echo -n "."
    sleep 1
done

# Function to start a resolver
start_resolver() {
    local PORT=$1
    local ENV_FILE=$2
    local NAME=$3
    local LOG_FILE="$PROJECT_ROOT/resolver-${PORT}.log"
    
    echo ""
    echo "   Starting $NAME on port $PORT..."
    
    # Export environment variables
    if [ -f "$PROJECT_ROOT/backend/resolver/$ENV_FILE" ]; then
        export $(cat "$PROJECT_ROOT/backend/resolver/$ENV_FILE" | grep -v '^#' | xargs)
    fi
    export RESOLVER_PORT=$PORT
    export RESOLVER_NAME=$NAME
    
    # Start resolver
    cd "$PROJECT_ROOT/backend/resolver"
    npm run dev > "$LOG_FILE" 2>&1 &
    local PID=$!
    echo "$PID" >> "$PID_FILE"
    echo "   $NAME PID: $PID"
    
    # Wait for resolver to start
    echo -n "   Waiting for $NAME to start"
    for i in {1..20}; do
        if check_port $PORT; then
            echo ""
            echo "   ✅ $NAME started successfully"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    echo "   ❌ $NAME failed to start. Check $LOG_FILE"
    return 1
}

# Start all resolvers
echo ""
echo "2. Starting Resolver Services..."

# Start Resolver 1 (Main)
start_resolver 4001 ".env" "Resolver-1" || exit 1

# Start Resolver 2
start_resolver 4002 ".env.resolver2" "Resolver-2" || exit 1

# Start Resolver 3
start_resolver 4003 ".env.resolver3" "Resolver-3" || exit 1

# Start Frontend
echo ""
echo "3. Starting Frontend (port 3000)..."
cd "$PROJECT_ROOT/frontend"
BROWSER=none npm start &
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
echo "   - Resolver 1: http://localhost:4001 (Aggressive)"
echo "   - Resolver 2: http://localhost:4002 (Patient)"
echo "   - Resolver 3: http://localhost:4003 (Opportunistic)"
echo ""
echo "📋 Logs:"
echo "   - Order Engine: tail -f $PROJECT_ROOT/order-engine.log"
echo "   - Resolver 1: tail -f $PROJECT_ROOT/resolver-4001.log"
echo "   - Resolver 2: tail -f $PROJECT_ROOT/resolver-4002.log"
echo "   - Resolver 3: tail -f $PROJECT_ROOT/resolver-4003.log"
echo ""
echo "🛑 To stop all services:"
echo "   ./stop-all.sh"
echo "   OR"
echo "   ./scripts/start-all.sh stop"
echo ""
echo "💡 Test Flow:"
echo "   1. Connect both MetaMask (Sepolia) and Petra (Testnet) wallets"
echo "   2. In the UI, expand the Resolver section"
echo "   3. Toggle on/off individual resolvers to see different strategies"
echo "   4. Enable 'Partial Fills' checkbox for order splitting"
echo "   5. Enable 'Dutch Auction' for competitive pricing"
echo "   6. Enter amount to swap (e.g., 0.0001 WETH)"
echo "   7. Click 'Swap Now' and watch resolvers compete!"
echo ""
echo "🎯 Resolver Strategies:"
echo "   - Resolver 1: Aggressive (fills early, larger amounts)"
echo "   - Resolver 2: Patient (waits for better rates)"
echo "   - Resolver 3: Opportunistic (fills throughout auction)"
echo ""

# Trap to handle Ctrl+C
trap 'echo ""; echo "Shutting down services..."; stop_services; exit' INT

# Keep script running
echo "Press Ctrl+C to stop all services..."
wait