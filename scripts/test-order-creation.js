const axios = require('axios');
const { ethers } = require('ethers');

const API_URL = 'http://localhost:3001';

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

async function createTestOrder() {
  // Create a test wallet
  const wallet = ethers.Wallet.createRandom();
  console.log('Test wallet address:', wallet.address);

  const orderData = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress,
    toToken: ethers.ZeroAddress, // Use zero address for test
    fromAmount: ethers.parseEther('0.001').toString(),
    minToAmount: ethers.parseEther('0.1').toString(),
    maker: wallet.address,
    receiver: wallet.address, // Use ETH address for test
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString(),
    partialFillAllowed: false
  };

  // Sign the order
  const signature = await wallet.signTypedData(
    EIP712_DOMAIN,
    { Order: ORDER_TYPE.Order },
    orderData
  );

  console.log('Order data:', orderData);
  console.log('Signature:', signature);

  try {
    // Submit the order
    const response = await axios.post(`${API_URL}/api/orders`, {
      ...orderData,
      signature
    });

    console.log('Order created successfully!');
    console.log('Order ID:', response.data.data.id);
    console.log('Full response:', JSON.stringify(response.data, null, 2));

    // Get the order back
    const getResponse = await axios.get(`${API_URL}/api/orders/${response.data.data.id}`);
    console.log('\nRetrieved order:', JSON.stringify(getResponse.data, null, 2));

  } catch (error) {
    console.error('Failed to create order:', error.response?.data || error.message);
  }
}

// Test WebSocket connection
const io = require('socket.io-client');
const socket = io(API_URL);

socket.on('connect', () => {
  console.log('Connected to WebSocket');
  socket.emit('subscribe:active');
});

socket.on('order:new', (order) => {
  console.log('New order received via WebSocket:', order);
});

// Run the test
createTestOrder();