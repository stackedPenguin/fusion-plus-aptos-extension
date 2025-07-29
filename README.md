# Fusion+ Aptos Extension

Cross-chain atomic swap implementation between Ethereum and Aptos using the Fusion+ protocol.

## Quick Start Testing Guide

### 1. Install All Dependencies
```bash
# From root directory
npm install

# Install backend dependencies
cd backend/order-engine && npm install && cd ../..
cd backend/resolver && npm install && cd ../..

# Install frontend dependencies  
cd frontend && npm install && cd ..

# Install contract dependencies
cd contracts/ethereum && npm install && cd ../..
```

### 2. Run Tests

#### Test Smart Contracts
```bash
# Test Ethereum contracts
cd contracts/ethereum
npx hardhat test

# Test Aptos contracts
cd contracts/aptos
aptos move test --named-addresses fusion_plus=0xCAFE
```

#### Test Order Engine
```bash
cd backend/order-engine
npm test
```

### 3. Run the System Locally

You'll need 3 terminal windows:

**Terminal 1 - Order Engine Backend:**
```bash
cd backend/order-engine
npm run dev
# Should see: "Order engine server running on port 3001"
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
# Opens http://localhost:3000
```

**Terminal 3 - Test the API:**
```bash
# Create a test order
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "fromChain": "ETHEREUM",
    "toChain": "APTOS",
    "fromToken": "0x0000000000000000000000000000000000000000",
    "toToken": "0x0000000000000000000000000000000000000000",
    "fromAmount": "1000000000000000",
    "minToAmount": "100000000",
    "maker": "0x742d35Cc6634C0532925a3b844Bc9e7595f00000",
    "receiver": "0x742d35Cc6634C0532925a3b844Bc9e7595f00000",
    "deadline": 1999999999,
    "nonce": "123456",
    "partialFillAllowed": false,
    "signature": "0x00"
  }'

# Get all orders
curl http://localhost:3001/api/orders

# Get specific order (replace ORDER_ID)
curl http://localhost:3001/api/orders/ORDER_ID
```

### 4. Test with UI

1. Open http://localhost:3000
2. Connect MetaMask (Sepolia testnet)
3. Connect Petra wallet (Aptos testnet)
4. Create a swap order
5. Monitor order status in the Order History section

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Ethereum       │     │  Order Engine   │     │     Aptos       │
│  Escrow         │◄────┤  (Off-chain)    ├────►│    Escrow       │
│  Contract       │     │                 │     │    Module       │
│                 │     └────────┬────────┘     │                 │
└─────────────────┘              │              └─────────────────┘
                                 │
                        ┌────────▼────────┐
                        │                 │
                        │    Resolver     │
                        │   (Relayer)     │
                        │                 │
                        └─────────────────┘
```

## Key Features

- **Gasless Swaps**: Users sign orders off-chain, resolvers pay gas
- **Atomic Swaps**: Hashlock/timelock ensures secure cross-chain transfers
- **Bidirectional**: Supports ETH→APT and APT→ETH swaps
- **Safety Deposits**: Incentivizes resolvers to complete swaps
- **Partial Fills**: Orders can be filled by multiple resolvers

## Contract Addresses (Testnet)

- **Ethereum Escrow**: Deploy to Sepolia
- **Aptos Escrow**: Deploy to Aptos Testnet

## Development Mode

The system includes development mode signatures that bypass full validation for testing. 
In production, proper signature validation must be implemented.

## Troubleshooting

1. **CORS errors**: Ensure backend is running before frontend
2. **Connection issues**: Check you're on correct networks (Sepolia/Aptos Testnet)
3. **Order creation fails**: Check browser console for detailed errors
4. **WebSocket not connecting**: Verify order engine is running on port 3001
