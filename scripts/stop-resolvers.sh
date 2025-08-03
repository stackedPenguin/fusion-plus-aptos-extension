#!/bin/bash

# Stop all resolver instances

echo "🛑 Stopping all resolver instances..."

if [ -f .resolver-pids ]; then
    while read pid; do
        if kill -0 $pid 2>/dev/null; then
            echo "Stopping resolver with PID $pid..."
            kill $pid
        fi
    done < .resolver-pids
    
    rm -f .resolver-pids
    echo "✅ All resolvers stopped!"
else
    echo "No resolver PID file found. Resolvers may not be running."
fi