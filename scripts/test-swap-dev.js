const axios = require('axios');

const API_URL = 'http://localhost:3001';

// Use the deployed wallet addresses
const USER_ETH_ADDRESS = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
const USER_APTOS_ADDRESS = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';

async function createSwapOrder(fromChain, toChain, fromAmount, minToAmount) {
  const orderData = {
    fromChain,
    toChain,
    fromToken: fromChain === 'ETHEREUM' 
      ? '0x0000000000000000000000000000000000000000'  // ETH
      : '0x1::aptos_coin::AptosCoin', // APT
    toToken: toChain === 'ETHEREUM' 
      ? '0x0000000000000000000000000000000000000000'  // ETH
      : '0x1::aptos_coin::AptosCoin', // APT
    fromAmount: fromChain === 'ETHEREUM'
      ? (parseFloat(fromAmount) * 1e18).toString()
      : (parseFloat(fromAmount) * 1e8).toString(), // Aptos uses 8 decimals
    minToAmount: toChain === 'ETHEREUM'
      ? (parseFloat(minToAmount) * 1e18).toString()
      : (parseFloat(minToAmount) * 1e8).toString(),
    maker: fromChain === 'ETHEREUM' ? USER_ETH_ADDRESS : USER_APTOS_ADDRESS,
    receiver: toChain === 'ETHEREUM' ? USER_ETH_ADDRESS : USER_APTOS_ADDRESS,
    deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    nonce: Date.now().toString(),
    partialFillAllowed: false,
    signature: '0x00' // Development mode signature
  };

  console.log('\n=== Creating Order (Dev Mode) ===');
  console.log(`From: ${fromChain} (${fromAmount})`);
  console.log(`To: ${toChain} (min ${minToAmount})`);

  try {
    const response = await axios.post(`${API_URL}/api/orders`, orderData);
    console.log('\n✅ Order created successfully!');
    console.log('Order ID:', response.data.data.id);
    console.log('Status:', response.data.data.status);
    
    return response.data.data.id;
  } catch (error) {
    console.error('\n❌ Failed to create order:', error.response?.data || error.message);
    if (error.response?.data?.details) {
      console.error('Validation errors:', JSON.stringify(error.response.data.details, null, 2));
    }
    throw error;
  }
}

async function checkOrderStatus(orderId) {
  try {
    const response = await axios.get(`${API_URL}/api/orders/${orderId}`);
    console.log('\n=== Order Status ===');
    console.log('ID:', response.data.data.id);
    console.log('Status:', response.data.data.status);
    console.log('From:', response.data.data.fromChain, response.data.data.fromAmount);
    console.log('To:', response.data.data.toChain, response.data.data.minToAmount);
    if (response.data.data.fills.length > 0) {
      console.log('Fills:', response.data.data.fills.length);
    }
    return response.data.data;
  } catch (error) {
    console.error('Failed to get order:', error.response?.data || error.message);
  }
}

// Monitor orders via WebSocket
const io = require('socket.io-client');
const socket = io(API_URL);

socket.on('connect', () => {
  console.log('\n📡 Connected to WebSocket');
  socket.emit('subscribe:active');
});

socket.on('order:new', (order) => {
  console.log('\n🔔 New order via WebSocket:', order.id, order.status);
});

socket.on(`order:update`, (data) => {
  console.log('\n🔄 Order updated:', data.order.id, 'Status:', data.order.status);
});

socket.on(`order:fill`, (data) => {
  console.log('\n💰 Order filled:', data.order.id, 'Fill amount:', data.fill.amount);
});

// Test different swap scenarios
async function runTests() {
  console.log('=== Fusion+ Backend Test (Development Mode) ===\n');
  console.log('This test uses signature "0x00" which is accepted in development mode.');
  console.log('Make sure NODE_ENV=development is set in the order engine.\n');
  
  try {
    // Test 1: ETH → APT swap
    console.log('\n1️⃣  Testing ETH → APT swap...');
    const order1 = await createSwapOrder('ETHEREUM', 'APTOS', '0.001', '0.5');
    
    // Subscribe to this specific order
    socket.emit('subscribe:order', order1);
    socket.on(`order:${order1}`, (order) => {
      console.log(`\n📌 Order ${order1} update:`, order.status);
    });
    
    // Wait a bit and check status
    await new Promise(resolve => setTimeout(resolve, 3000));
    await checkOrderStatus(order1);
    
    // Test 2: APT → ETH swap
    console.log('\n\n2️⃣  Testing APT → ETH swap...');
    const order2 = await createSwapOrder('APTOS', 'ETHEREUM', '1', '0.002');
    
    socket.emit('subscribe:order', order2);
    socket.on(`order:${order2}`, (order) => {
      console.log(`\n📌 Order ${order2} update:`, order.status);
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    await checkOrderStatus(order2);
    
    // List all active orders
    console.log('\n\n3️⃣  Getting all active orders...');
    const activeResponse = await axios.get(`${API_URL}/api/orders`);
    console.log('Active orders:', activeResponse.data.data.length);
    activeResponse.data.data.forEach(order => {
      console.log(`- ${order.id}: ${order.fromChain} → ${order.toChain}, Status: ${order.status}`);
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  // Keep connection open to see WebSocket updates
  console.log('\n\n✨ Watching for order updates. Press Ctrl+C to exit...');
  console.log('The resolver should pick up and fill these orders automatically.');
}

// Run the tests
runTests();