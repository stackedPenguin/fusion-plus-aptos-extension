# Fusion+ Frontend Guide

## 🚀 Quick Start

```bash
# Start all services
./scripts/start-all.sh

# Or start individually:
# Terminal 1: Order Engine
cd backend/order-engine && npm run dev

# Terminal 2: Resolver
cd backend/resolver && npm run dev

# Terminal 3: Frontend
cd frontend && npm start
```

## 💳 Wallet Setup

### Ethereum (Sepolia Testnet)
1. Install MetaMask
2. Switch to Sepolia testnet
3. Get test ETH from: https://sepoliafaucet.com/

### Aptos (Testnet)
1. Install Petra wallet
2. Switch to Testnet
3. Get test APT from: https://aptos.dev/en/network/faucet

## 🔄 How to Swap ETH → APT

1. **Connect Wallets**
   - Click "Connect MetaMask" for Ethereum
   - Click "Connect Petra" for Aptos

2. **Enter Swap Details**
   - Select "Ethereum" as From Chain
   - Enter amount (e.g., 0.001 ETH)
   - The UI will automatically calculate expected APT output
   - Shows real-time exchange rate from CoinGecko

3. **Create Order**
   - Click "Create Swap Order"
   - Order is signed (using dev mode for cross-chain)
   - Submitted to order engine

4. **Watch Progress**
   - Status updates in real-time via WebSocket
   - "Submitting" → "Waiting for Resolver" → "Escrow Created"
   - When resolver locks APT, you'll see the secret hash

5. **Complete Swap** (Manual steps for now)
   - User creates source escrow on Ethereum
   - Resolver reveals secret on Ethereum
   - User claims APT on Aptos using revealed secret

## 📊 Features

- **Real-time Exchange Rates**: Live ETH/APT prices from CoinGecko
- **Automatic Fee Calculation**: 1% resolver fee included
- **Balance Display**: Shows wallet balances for both chains
- **Order History**: Track all your swap orders
- **WebSocket Updates**: Real-time status updates
- **Responsive UI**: Clean, modern interface

## 🛠️ Technical Details

### Frontend Stack
- React with TypeScript
- ethers.js for Ethereum interaction
- Aptos Wallet Adapter for Aptos
- Socket.io for real-time updates
- Web3Modal for wallet connection

### API Endpoints
- Order Engine: `http://localhost:3001/api/orders`
- WebSocket: `ws://localhost:3001`

### Order Flow
1. User creates intent (off-chain signature)
2. Order submitted to order engine
3. Resolver evaluates profitability
4. Resolver creates destination escrow
5. User creates source escrow
6. Atomic swap via HTLC

## 🐛 Troubleshooting

### Source Map Warnings
You may see warnings about missing source maps from `@scure/bip39`:
```
Failed to parse source map from '.../node_modules/aptos/node_modules/@scure/bip39/src/index.ts'
```
**These are harmless** - they're just missing source maps from dependencies and don't affect functionality.

### "Cannot connect to wallet"
- Ensure wallet is installed and unlocked
- Check you're on correct network (Sepolia/Testnet)

### "Order failed"
- Check console for detailed errors
- Ensure you have sufficient balance
- Verify both services are running

### "No resolver response"
- Check resolver service is running
- Verify exchange rates are loading
- Check resolver logs: `tail -f resolver.log`

## 📝 Current Limitations

- Cross-chain signatures use dev mode (0x00)
- Aptos wallet integration is simulated on resolver side
- Manual escrow creation required (not automated in UI yet)
- Only supports ETH ↔ APT swaps

## 🚧 Coming Soon

- Automated escrow creation UI
- Partial fills support
- More token pairs
- Production signature validation
- On-chain resolver registry