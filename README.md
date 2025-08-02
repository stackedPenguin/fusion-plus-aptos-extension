# Fusion+ Aptos Extension

🚀 **True Gasless Cross-Chain Swaps** between Ethereum and Aptos using the Fusion+ protocol.

✨ **Users pay ZERO gas fees** - Just sign transactions, resolver covers all gas costs!

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

### 5. Try Gasless WETH → APT Swaps

🚀 **Experience true gasless swaps:**

1. **Get WETH**: Wrap some ETH to WETH on Sepolia
2. **One-Time Setup**: Approve WETH to gasless escrow (pays gas once)
3. **Gasless Forever**: All future swaps are gasless!
   - Select WETH → APT
   - Sign meta-transaction (no gas)
   - Receive APT automatically
4. **Monitor Progress**: Watch real-time swap execution with zero fees

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

### 🌟 **Gasless WETH to APT Swaps**
- **Zero Gas Fees**: Users pay no gas after one-time WETH approval
- **Meta-Transactions**: EIP-712 signatures enable gasless WETH transfers
- **Production Ready**: Deployed and tested on Sepolia + Aptos Testnet

### 🔒 **Atomic Security**
- **Hashlock/Timelock**: Cryptographic guarantees for cross-chain safety
- **Trustless**: No custody risk, funds locked in smart contracts
- **Resolver Incentives**: Safety deposits ensure completion

### 🔄 **Cross-Chain Support**
- **WETH → APT**: Gasless swaps using meta-transactions
- **APT → WETH**: Sponsored transactions on Aptos
- **Bidirectional**: Full support for both swap directions

### ⚡ **User Experience**
- **One-Click Approval**: Approve WETH once, swap forever gaslessly
- **Real-Time Updates**: Live swap progress with asset flow tracking
- **Auto-Complete**: Resolver handles all on-chain execution

## Contract Addresses (Testnet)

### Ethereum (Sepolia)
- **Regular Escrow**: `0x5Ea57C2Fb5f054E9bdBdb3449135f823439E1338`
- **Gasless Escrow**: `0x4868C055E894f6C774960a175aD11Dec26f8475f` ✨
- **WETH Token**: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`

### Aptos (Testnet)
- **Escrow Module**: `0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca`

## Technical Documentation

📚 **Detailed Guides:**
- **[Gasless WETH Swaps](./docs/GASLESS_WETH_SWAPS.md)** - Complete technical implementation
- **[Deployment Summary](./GASLESS_DEPLOYMENT_SUMMARY.md)** - Contract deployment details
- **[Testing Scripts](./scripts/)** - Utilities for testing gasless functionality

🔧 **Smart Contracts:**
- **[FusionPlusGaslessEscrow.sol](./contracts/ethereum/contracts/FusionPlusGaslessEscrow.sol)** - Gasless escrow with meta-transactions
- **[Aptos Escrow Module](./contracts/aptos/)** - Cross-chain escrow on Aptos

## Development Mode

The system includes development mode signatures that bypass full validation for testing. 
In production, proper signature validation must be implemented.

## Troubleshooting

### General Issues
1. **CORS errors**: Ensure backend is running before frontend
2. **Connection issues**: Check you're on correct networks (Sepolia/Aptos Testnet)
3. **Order creation fails**: Check browser console for detailed errors
4. **WebSocket not connecting**: Verify order engine is running on port 3001

### Gasless Swap Issues
5. **"Gasless swaps require WETH approval"**: Approve WETH to gasless escrow contract first
6. **Meta-transaction fails**: Check WETH balance and allowance using debug scripts
7. **Escrow not found**: Ensure Aptos escrow module is deployed correctly
8. **Signature errors**: Confirm MetaMask is connected and on Sepolia testnet

### Debug Commands
```bash
# Check WETH approval status
node scripts/check-weth-approval-gasless.js

# Test gasless functionality  
node scripts/test-gasless-weth.js

# Decode failed transactions
node scripts/decode-gasless-tx.js
```
