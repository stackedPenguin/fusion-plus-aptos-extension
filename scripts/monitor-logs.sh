#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "📊 Fusion+ Log Monitor"
echo "===================="
echo ""
echo "Press Ctrl+C to exit"
echo ""

# Use tail with multiple files
tail -f "$PROJECT_ROOT/order-engine.log" "$PROJECT_ROOT/resolver.log" | while read line; do
    # Color code based on which log it's from
    if [[ $line == *"order-engine.log"* ]]; then
        echo -e "\033[34m[ORDER ENGINE]\033[0m ${line#*==> * <==}"
    elif [[ $line == *"resolver.log"* ]]; then
        echo -e "\033[32m[RESOLVER]\033[0m ${line#*==> * <==}"
    elif [[ $line == *"Error"* ]] || [[ $line == *"error"* ]]; then
        echo -e "\033[31m$line\033[0m"
    elif [[ $line == *"✅"* ]] || [[ $line == *"Success"* ]]; then
        echo -e "\033[32m$line\033[0m"
    elif [[ $line == *"⏳"* ]] || [[ $line == *"Waiting"* ]]; then
        echo -e "\033[33m$line\033[0m"
    else
        echo "$line"
    fi
done