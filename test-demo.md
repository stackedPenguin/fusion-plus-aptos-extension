# Testing Fusion+ Cross-Chain Swap

## Prerequisites

1. **Install Dependencies**
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend/order-engine && npm install
cd ../resolver && npm install

# Install frontend dependencies
cd ../../frontend && npm install
```

2. **Set Up Test Wallets**
- Create test wallets for Ethereum (Sepolia) and Aptos (Testnet)
- Get test ETH from Sepolia faucet: https://sepoliafaucet.com/
- Get test APT from Aptos faucet: https://aptos.dev/en/network/faucet

## Running the System

### Terminal 1: Order Engine
```bash
cd backend/order-engine
npm run dev
# Should see: "Order engine server running on port 3001"
```

### Terminal 2: Frontend
```bash
cd frontend
npm start
# Opens http://localhost:3000
```

### Terminal 3: Resolver (Optional for automated fills)
```bash
cd backend/resolver
# First configure .env with your test wallet keys
npm run dev
```

## Testing Flow

### 1. Connect Wallets
- Open http://localhost:3000
- Click "Connect MetaMask" and connect to Sepolia testnet
- Click "Connect Petra" and connect to Aptos testnet

### 2. Create a Test Swap Order
- Select "From Chain": Ethereum
- Enter "Amount": 0.001 (ETH)
- Select "To Chain": Aptos  
- Enter "Minimum Amount to Receive": 0.1 (APT)
- Click "Create Swap Order"
- Sign the message in MetaMask (gasless - no ETH spent!)

### 3. Monitor Order Status
- Check "Order History" section
- Order should appear as "PENDING"
- Copy the Order ID for API testing

### 4. Test API Endpoints
```bash
# Get order details
curl http://localhost:3001/api/orders/{ORDER_ID}

# Get all active orders
curl http://localhost:3001/api/orders

# Get orders by maker
curl http://localhost:3001/api/orders/maker/{YOUR_ETH_ADDRESS}
```

### 5. Simulate Resolver Fill (Manual)
```bash
# Create a fill
curl -X POST http://localhost:3001/api/orders/{ORDER_ID}/fills \
  -H "Content-Type: application/json" \
  -d '{
    "resolver": "0x123...",
    "amount": "1000000000000000",
    "secretHash": "0xabc123...",
    "secretIndex": 0,
    "status": "PENDING"
  }'
```

## Contract Testing (Local)

### Test Ethereum Contracts
```bash
cd contracts/ethereum
npx hardhat test
```

### Test Aptos Contracts
```bash
cd contracts/aptos
aptos move test --named-addresses fusion_plus=0xCAFE
```

## WebSocket Testing

Connect to WebSocket at `ws://localhost:3001` and monitor real-time updates:
```javascript
const socket = io('http://localhost:3001');
socket.emit('subscribe:active');
socket.on('order:new', (order) => console.log('New order:', order));
```

## Troubleshooting

1. **CORS Issues**: Make sure backend is running before frontend
2. **Wallet Connection**: Ensure you're on the correct network (Sepolia/Aptos Testnet)
3. **Order Creation Failed**: Check browser console for detailed errors
4. **Missing Dependencies**: Run `npm install` in each directory

## Demo Scenarios

### Scenario 1: ETH → APT Swap
1. User has ETH on Ethereum, wants APT on Aptos
2. Creates order signing with MetaMask
3. Resolver locks ETH in Ethereum escrow
4. Resolver locks APT in Aptos escrow
5. Secret revealed, both parties receive assets

### Scenario 2: APT → ETH Swap
1. User has APT on Aptos, wants ETH on Ethereum
2. Creates order (currently needs Ethereum signature)
3. Same escrow flow but reversed

### Scenario 3: Partial Fill
1. Create order with `partialFillAllowed: true`
2. Multiple resolvers can fill portions
3. Each uses different secret from Merkle tree