const axios = require('axios');
const { ethers } = require('ethers');

const API_URL = 'http://localhost:3001';

// Use the deployed wallet keys from DEPLOYMENT.md
const USER_ETH_PRIVATE_KEY = '0x18a8c8a12601a5b7818acae7f2ac748d71f7f2309f85f0724c5455d23426b808';
const USER_ETH_ADDRESS = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
const USER_APTOS_ADDRESS = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';

const EIP712_DOMAIN = {
  name: 'FusionPlusAptos',
  version: '1',
  chainId: 11155111, // Sepolia
};

const ORDER_TYPE = {
  Order: [
    { name: 'fromChain', type: 'string' },
    { name: 'toChain', type: 'string' },
    { name: 'fromToken', type: 'address' },
    { name: 'toToken', type: 'address' },
    { name: 'fromAmount', type: 'uint256' },
    { name: 'minToAmount', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'partialFillAllowed', type: 'bool' },
  ],
};

// Helper to convert Aptos address to Ethereum format for signing
function aptosToEthAddress(aptosAddr) {
  // Handle Aptos token format (0x1::aptos_coin::AptosCoin)
  if (aptosAddr.includes('::')) {
    // Use a deterministic conversion for Aptos token addresses
    return '0x' + '0'.repeat(24) + '1'.repeat(16); // Placeholder address
  }
  // Handle regular Aptos addresses
  if (aptosAddr.startsWith('0x') && aptosAddr.length > 42) {
    return '0x' + aptosAddr.slice(2, 42);
  }
  return aptosAddr;
}

async function createSwapOrder(fromChain, toChain, fromAmount, minToAmount) {
  const wallet = new ethers.Wallet(USER_ETH_PRIVATE_KEY);
  
  const orderData = {
    fromChain,
    toChain,
    fromToken: fromChain === 'ETHEREUM' 
      ? ethers.ZeroAddress  // ETH
      : '0x1::aptos_coin::AptosCoin', // APT
    toToken: toChain === 'ETHEREUM' 
      ? ethers.ZeroAddress  // ETH
      : '0x1::aptos_coin::AptosCoin', // APT
    fromAmount: fromChain === 'ETHEREUM'
      ? ethers.parseEther(fromAmount).toString()
      : (parseFloat(fromAmount) * 1e8).toString(), // Aptos uses 8 decimals
    minToAmount: toChain === 'ETHEREUM'
      ? ethers.parseEther(minToAmount).toString()
      : (parseFloat(minToAmount) * 1e8).toString(),
    maker: fromChain === 'ETHEREUM' ? USER_ETH_ADDRESS : USER_APTOS_ADDRESS,
    receiver: toChain === 'ETHEREUM' ? USER_ETH_ADDRESS : USER_APTOS_ADDRESS,
    deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    nonce: Date.now().toString(),
    partialFillAllowed: false
  };

  console.log('\n=== Creating Order ===');
  console.log(`From: ${fromChain} (${fromAmount})`);
  console.log(`To: ${toChain} (min ${minToAmount})`);
  console.log('Order data:', JSON.stringify(orderData, null, 2));

  // Sign the order - convert Aptos addresses for signing
  const signData = {
    ...orderData,
    fromToken: fromChain === 'APTOS' ? aptosToEthAddress(orderData.fromToken) : orderData.fromToken,
    toToken: toChain === 'APTOS' ? aptosToEthAddress(orderData.toToken) : orderData.toToken,
    maker: fromChain === 'APTOS' ? aptosToEthAddress(orderData.maker) : orderData.maker,
    receiver: toChain === 'APTOS' ? aptosToEthAddress(orderData.receiver) : orderData.receiver,
  };

  // Checksum all addresses for signing
  const checksummedSignData = {
    ...signData,
    fromToken: ethers.getAddress(signData.fromToken),
    toToken: ethers.getAddress(signData.toToken),
    maker: ethers.getAddress(signData.maker),
    receiver: ethers.getAddress(signData.receiver),
  };

  const signature = await wallet.signTypedData(
    EIP712_DOMAIN,
    { Order: ORDER_TYPE.Order },
    checksummedSignData
  );

  console.log('Signature:', signature);

  try {
    // Submit the order with original data
    const response = await axios.post(`${API_URL}/api/orders`, {
      ...orderData,
      signature
    });

    console.log('\n✅ Order created successfully!');
    console.log('Order ID:', response.data.data.id);
    console.log('Status:', response.data.data.status);
    
    return response.data.data.id;
  } catch (error) {
    console.error('\n❌ Failed to create order:', error.response?.data || error.message);
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
  console.log('\n🔔 New order via WebSocket:', order.id);
});

socket.on('order:update', (order) => {
  console.log('\n🔄 Order updated:', order.id, 'Status:', order.status);
});

// Test different swap scenarios
async function runTests() {
  console.log('=== Fusion+ Backend Swap Test ===\n');
  
  try {
    // Test 1: ETH → APT swap
    console.log('\n1️⃣  Testing ETH → APT swap...');
    const order1 = await createSwapOrder('ETHEREUM', 'APTOS', '0.001', '0.5');
    
    // Wait a bit and check status
    await new Promise(resolve => setTimeout(resolve, 2000));
    await checkOrderStatus(order1);
    
    // Test 2: APT → ETH swap
    console.log('\n\n2️⃣  Testing APT → ETH swap...');
    const order2 = await createSwapOrder('APTOS', 'ETHEREUM', '1', '0.002');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
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
  console.log('\n\n✨ Keeping WebSocket connection open. Press Ctrl+C to exit...');
}

// Run the tests
runTests();