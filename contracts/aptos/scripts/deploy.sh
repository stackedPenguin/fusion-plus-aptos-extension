#!/bin/bash

# Deploy Fusion+ Escrow to Aptos Testnet

echo "Deploying Fusion+ Escrow to Aptos Testnet..."

# Set the deployer address (you'll need to replace this with your actual address)
DEPLOYER_ADDRESS="0x1"

# Compile the module
echo "Compiling Move module..."
aptos move compile --named-addresses fusion_plus=$DEPLOYER_ADDRESS

# Deploy the module
echo "Deploying to testnet..."
aptos move publish \
  --named-addresses fusion_plus=$DEPLOYER_ADDRESS \
  --assume-yes \
  --profile testnet

echo "Deployment complete!"
echo "Remember to update the escrow address in your configuration files."