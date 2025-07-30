#!/bin/bash

echo "🔍 Fusion+ Service Status"
echo "========================"
echo ""

# Function to check if a port is in use
check_service() {
    local port=$1
    local name=$2
    
    if lsof -ti:$port > /dev/null 2>&1; then
        local pid=$(lsof -ti:$port | head -1)
        echo "✅ $name (port $port): Running [PID: $pid]"
    else
        echo "❌ $name (port $port): Not running"
    fi
}

# Check each service
check_service 3001 "Order Engine"
check_service 3002 "Resolver"
check_service 3000 "Frontend"

echo ""

# Check if log files exist
echo "📋 Log Files:"
if [ -f "order-engine.log" ]; then
    echo "   ✓ order-engine.log ($(wc -l < order-engine.log) lines)"
else
    echo "   - order-engine.log not found"
fi

if [ -f "resolver.log" ]; then
    echo "   ✓ resolver.log ($(wc -l < resolver.log) lines)"
else
    echo "   - resolver.log not found"
fi

echo ""
echo "💡 Commands:"
echo "   Start all:    ./scripts/start-all.sh"
echo "   Stop all:     ./scripts/start-all.sh stop"
echo "   Monitor logs: ./scripts/monitor-logs.sh"