#!/bin/bash

echo "🚀 Starting Fusion+ Services"
echo "=========================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Kill existing processes
echo "🔪 Killing existing processes..."
pkill -f "order-engine" || true
pkill -f "resolver" || true
pkill -f "relayer" || true
sleep 2

# Start Order Engine
echo -e "\n${GREEN}Starting Order Engine (Port 3001)...${NC}"
cd backend/order-engine
npm install
npm run dev > order-engine.log 2>&1 &
ORDER_ENGINE_PID=$!
cd ../..

# Wait for Order Engine to start
sleep 3
if check_port 3001; then
    echo -e "${GREEN}✅ Order Engine started${NC}"
else
    echo -e "${RED}❌ Order Engine failed to start${NC}"
    exit 1
fi

# Start Resolver
echo -e "\n${GREEN}Starting Resolver Service (Port 3002)...${NC}"
cd backend/resolver
npm install
npm run dev > resolver.log 2>&1 &
RESOLVER_PID=$!
cd ../..

# Wait for Resolver to start
sleep 3
if check_port 3002; then
    echo -e "${GREEN}✅ Resolver started${NC}"
else
    echo -e "${RED}❌ Resolver failed to start${NC}"
    exit 1
fi

# Start Relayer
echo -e "\n${GREEN}Starting Relayer Service (Port 3003)...${NC}"
cd backend/relayer
npm install
npm run dev > relayer.log 2>&1 &
RELAYER_PID=$!
cd ../..

# Wait for Relayer to start
sleep 3
if check_port 3003; then
    echo -e "${GREEN}✅ Relayer started${NC}"
else
    echo -e "${RED}❌ Relayer failed to start${NC}"
    exit 1
fi

echo -e "\n${GREEN}All services started!${NC}"
echo "=========================="
echo "Order Engine: http://localhost:3001"
echo "Resolver:     http://localhost:3002"
echo "Relayer:      http://localhost:3003"
echo ""
echo "Logs:"
echo "  Order Engine: backend/order-engine/order-engine.log"
echo "  Resolver:     backend/resolver/resolver.log"
echo "  Relayer:      backend/relayer/relayer.log"
echo ""
echo "To stop all services: pkill -f 'order-engine|resolver|relayer'"
echo ""
echo "PIDs:"
echo "  Order Engine: $ORDER_ENGINE_PID"
echo "  Resolver:     $RESOLVER_PID"
echo "  Relayer:      $RELAYER_PID"

# Keep script running
echo ""
echo "Press Ctrl+C to stop all services..."
trap "echo 'Stopping services...'; kill $ORDER_ENGINE_PID $RESOLVER_PID $RELAYER_PID; exit" INT
wait