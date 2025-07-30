#!/bin/bash

echo "🚀 Starting Real Balance Flow Test"
echo "================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to cleanup
cleanup() {
    echo -e "\n${BLUE}Stopping services...${NC}"
    pkill -f "order-engine|resolver|relayer" || true
    exit
}

# Set trap for cleanup
trap cleanup INT TERM EXIT

# Kill any existing services
echo -e "${BLUE}Cleaning up existing services...${NC}"
pkill -f "order-engine|resolver|relayer" || true
sleep 2

# Start Order Engine
echo -e "\n${GREEN}Starting Order Engine...${NC}"
cd backend/order-engine
npm run dev > order-engine.log 2>&1 &
ORDER_PID=$!
cd ../..
sleep 3

# Start Resolver V2
echo -e "${GREEN}Starting Resolver V2...${NC}"
cd backend/resolver
npm run dev > resolver.log 2>&1 &
RESOLVER_PID=$!
cd ../..
sleep 3

# Start Relayer
echo -e "${GREEN}Starting Relayer...${NC}"
cd backend/relayer
npm run dev > relayer.log 2>&1 &
RELAYER_PID=$!
cd ../..
sleep 3

echo -e "\n${GREEN}All services started!${NC}"
echo "================================="

# Wait a bit for services to fully initialize
sleep 5

# Run the test
echo -e "\n${BLUE}Running real balance flow test...${NC}\n"
node scripts/test-real-balance-flow.js

# The cleanup function will stop services when script exits