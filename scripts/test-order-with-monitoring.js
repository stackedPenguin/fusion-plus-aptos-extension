const axios = require('axios');
const io = require('socket.io-client');

const ORDER_ENGINE_URL = 'http://localhost:3001';

async function testOrderWithMonitoring() {
  console.log('🚀 Testing Order Flow with Monitoring');
  console.log('═'.repeat(80));

  // Connect to WebSocket first
  const socket = io(ORDER_ENGINE_URL);
  
  socket.on('connect', () => {
    console.log('✅ Connected to order engine WebSocket');
  });

  socket.on('order:new', (order) => {
    console.log('\n📨 New order event received:', order.id);
  });

  socket.on('escrow:destination:created', (data) => {
    console.log('\n🎯 Destination escrow created!');
    console.log('   Chain:', data.chain);
    console.log('   Secret hash:', data.secretHash);
    console.log('   Escrow ID:', data.escrowId);
    process.exit(0);
  });

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 1000));

  const order = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: '0x0000000000000000000000000000000000000000',
    toToken: '0x1::aptos_coin::AptosCoin',
    fromAmount: '500000000000000', // 0.0005 ETH
    minToAmount: '41290000', // ~0.4129 APT (matching exchange rate)
    maker: '0x4479B0150248772B44B63817c11c589a25957e85',
    receiver: '0x3cf8d46b8ad3e1be66c7d42dbcb3f5f0241d86015bd4d521e65ed8df1a97633b',
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString(),
    partialFillAllowed: false,
    signature: '0x00' // Dev mode
  };

  try {
    console.log('\n📤 Submitting order...');
    console.log(`   From: ${parseFloat(order.fromAmount) / 1e18} ETH`);
    console.log(`   Min to: ${parseFloat(order.minToAmount) / 1e8} APT`);
    
    const response = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, order);
    const orderId = response.data.data?.id;
    console.log(`✅ Order submitted: ${orderId}`);
    
    // Subscribe to order updates
    socket.emit('subscribe:order', orderId);
    
    console.log('\n⏳ Waiting for resolver to process...');
    console.log('   (Check resolver console for detailed logs)');
    
    // Keep alive for 30 seconds
    setTimeout(() => {
      console.log('\n⏰ Timeout - check logs manually');
      socket.close();
      process.exit(0);
    }, 30000);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    socket.close();
    process.exit(1);
  }
}

testOrderWithMonitoring().catch(console.error);