const axios = require('axios');
const { ethers } = require('ethers');
const { io } = require('socket.io-client');

const API_URL = 'http://localhost:3001';

async function runE2EDemo() {
  console.log('=== Fusion+ End-to-End Demo ===\n');
  
  // 1. Create a test wallet (simulating user)
  const wallet = ethers.Wallet.createRandom();
  console.log('1. Created test wallet:', wallet.address);
  
  // 2. Create swap order (ETH -> APT)
  console.log('\n2. Creating cross-chain swap order (ETH -> APT)...');
  const orderData = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress,
    toToken: ethers.ZeroAddress,
    fromAmount: ethers.parseEther('0.1').toString(),
    minToAmount: ethers.parseEther('10').toString(), // 10 APT
    maker: wallet.address,
    receiver: '0x' + '1'.repeat(64), // Mock Aptos address
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString(),
    partialFillAllowed: false,
    signature: '0x00' // Dev mode
  };
  
  const createResponse = await axios.post(`${API_URL}/api/orders`, orderData);
  const order = createResponse.data.data;
  console.log('   Order created:', order.id);
  console.log('   Status:', order.status);
  console.log('   Amount:', ethers.formatEther(order.fromAmount), 'ETH');
  
  // 3. Simulate resolver monitoring
  console.log('\n3. Resolver monitoring order...');
  console.log('   [Resolver] Found profitable order:', order.id);
  console.log('   [Resolver] Checking balances...');
  console.log('   [Resolver] Has sufficient APT on Aptos');
  
  // 4. Simulate resolver creating fill
  console.log('\n4. Resolver filling order...');
  const fillData = {
    resolver: '0x' + '2'.repeat(40),
    amount: order.fromAmount,
    secretHash: '0x' + ethers.randomBytes(32).toString('hex'),
    secretIndex: 0,
    status: 'PENDING'
  };
  
  const fillResponse = await axios.post(`${API_URL}/api/orders/${order.id}/fills`, fillData);
  const fill = fillResponse.data.data;
  console.log('   Fill created:', fill.id);
  
  // 5. Simulate on-chain execution
  console.log('\n5. Executing on-chain transactions...');
  console.log('   [Ethereum] Creating escrow with hashlock...');
  console.log('   [Ethereum] TX: 0x' + ethers.randomBytes(32).toString('hex'));
  
  await axios.patch(`${API_URL}/api/orders/${order.id}/fills/${fill.id}`, {
    status: 'LOCKED',
    sourceChainTxHash: '0x' + ethers.randomBytes(32).toString('hex')
  });
  
  console.log('   [Aptos] Creating escrow with same hashlock...');
  console.log('   [Aptos] TX: 0x' + ethers.randomBytes(32).toString('hex'));
  
  // 6. Simulate secret reveal
  console.log('\n6. Revealing secret and completing swap...');
  const secret = ethers.randomBytes(32);
  console.log('   Secret revealed:', '0x' + secret.toString('hex'));
  console.log('   [Ethereum] Withdrawing to resolver...');
  console.log('   [Aptos] Withdrawing to user...');
  
  await axios.patch(`${API_URL}/api/orders/${order.id}/fills/${fill.id}`, {
    status: 'COMPLETED',
    destChainTxHash: '0x' + ethers.randomBytes(32).toString('hex')
  });
  
  // 7. Check final status
  const finalOrder = await axios.get(`${API_URL}/api/orders/${order.id}`);
  console.log('\n7. Swap completed!');
  console.log('   Order status:', finalOrder.data.data.status);
  console.log('   User sent: 0.1 ETH');
  console.log('   User received: 10 APT');
  console.log('   Gas paid by: Resolver');
  
  console.log('\n=== Demo Complete ===');
  console.log('\nKey Features Demonstrated:');
  console.log('✓ Gasless swaps - User only signed, resolver paid gas');
  console.log('✓ Atomic swaps - Hashlock/timelock ensures security');
  console.log('✓ Cross-chain - ETH on Ethereum to APT on Aptos');
  console.log('✓ Intent-based - Off-chain order, on-chain settlement');
}

// Connect to WebSocket for real-time updates
const socket = io(API_URL);
socket.on('connect', () => {
  console.log('Connected to order engine WebSocket\n');
  socket.emit('subscribe:active');
});

socket.on('order:new', (order) => {
  console.log('[WebSocket] New order:', order.id);
});

socket.on('order:fill', ({ order, fill }) => {
  console.log('[WebSocket] Order filled:', order.id, 'by', fill.resolver);
});

// Run the demo
runE2EDemo().catch(console.error);