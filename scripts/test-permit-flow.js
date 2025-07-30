const { ethers } = require('ethers');
const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const ORDER_ENGINE_URL = 'http://localhost:3001';
const ETHEREUM_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const PERMIT_CONTRACT = '0x1eB5f27B160Aa22D024164c80F00bD5F73dDBb1E';

// Test addresses
const USER_ETH = '0x4479B0150248772B44B63817c11c589a25957e85';
const USER_APT = '0x3cf8d46b8ad3e1be66c7d42dbcb3f5f0241d86015bd4d521e65ed8df1a97633b';
const RESOLVER_ETH = '0x2d61a25DFaC21604C5EaBDa303c9CC9F367d6c17';

// EIP-712 domain
const DOMAIN = {
  name: 'Fusion+ Cross-Chain Swap',
  version: '1',
  chainId: 11155111, // Sepolia
  verifyingContract: PERMIT_CONTRACT
};

// EIP-712 types
const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

async function testPermitFlow() {
  console.log('🚀 Testing Fusion+ Permit Flow\n');
  
  // Connect to Ethereum
  const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
  const privateKey = process.env.ETHEREUM_USER_PRIVATE_KEY || '0x...'; // Add your test private key
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log('📱 User wallet:', wallet.address);
  
  // Check ETH balance
  const balance = await provider.getBalance(wallet.address);
  console.log('💰 ETH balance:', ethers.formatEther(balance), 'ETH\n');
  
  // Create order data
  const swapAmount = ethers.parseEther('0.0005'); // 0.0005 ETH
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  
  // Get nonce from permit contract
  const permitAbi = ['function getNonce(address owner) view returns (uint256)'];
  const permitContract = new ethers.Contract(PERMIT_CONTRACT, permitAbi, provider);
  const nonce = await permitContract.getNonce(wallet.address);
  
  console.log('📝 Creating permit for automatic transfer...');
  console.log('   Amount:', ethers.formatEther(swapAmount), 'ETH');
  console.log('   Nonce:', nonce.toString());
  console.log('   Deadline:', new Date(deadline * 1000).toLocaleString());
  
  // Create permit data
  const permit = {
    owner: wallet.address,
    spender: RESOLVER_ETH,
    value: swapAmount.toString(),
    nonce: nonce.toString(),
    deadline: deadline
  };
  
  // Sign permit
  const signature = await wallet.signTypedData(DOMAIN, PERMIT_TYPES, permit);
  console.log('✅ Permit signed!\n');
  
  // Create order with permit
  const orderData = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress, // ETH
    toToken: '0x1::aptos_coin::AptosCoin', // APT
    fromAmount: swapAmount.toString(),
    minToAmount: '40000000', // 0.4 APT (8 decimals)
    maker: wallet.address,
    receiver: USER_APT,
    deadline: deadline,
    permit: permit,
    permitSignature: signature
  };
  
  console.log('📤 Submitting order with permit...');
  
  try {
    // Submit order
    const response = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, orderData);
    const order = response.data.data;
    
    console.log('✅ Order submitted!');
    console.log('   Order ID:', order.id);
    console.log('   Has permit:', !!order.permit);
    
    // Connect to WebSocket for updates
    const socket = io(ORDER_ENGINE_URL);
    
    socket.on('connect', () => {
      console.log('\n🔌 Connected to order engine WebSocket');
      socket.emit('subscribe:order', order.id);
    });
    
    socket.on(`order:${order.id}:update`, (update) => {
      console.log('📊 Order update:', update.status);
      if (update.status === 'COMPLETED') {
        console.log('🎉 Swap completed automatically!');
        process.exit(0);
      }
    });
    
    socket.on('escrow:destination:created', (data) => {
      if (data.orderId === order.id) {
        console.log('\n💎 Destination escrow created on Aptos!');
        console.log('   Escrow ID:', data.escrowId);
        console.log('   TX Hash:', data.txHash);
        console.log('   🎫 Automatic transfer should happen next...');
      }
    });
    
    socket.on('escrow:source:withdrawn', (data) => {
      if (data.orderId === order.id) {
        console.log('\n💸 Source escrow withdrawn automatically!');
        console.log('   Secret revealed:', data.secret);
        console.log('   TX Hash:', data.txHash);
        console.log('   🚀 Funds should be transferred to user on Aptos...');
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testPermitFlow().catch(console.error);