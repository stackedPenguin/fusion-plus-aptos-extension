const axios = require('axios');
const { ethers } = require('ethers');
const io = require('socket.io-client');

// Configuration
const ORDER_ENGINE_URL = 'http://localhost:3001';
const ETHEREUM_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const ETHEREUM_ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';

// Test accounts - using the funded test account
const MAKER_PRIVATE_KEY = '0x9aa575bac62c0966d497971a4504d8a5b68b198608120553d38da3bba8436efe';
const MAKER_ADDRESS = '0x4479B0150248772B44B63817c11c589a25957e85';
const APTOS_RECEIVER = '0x3cf8d46b8ad3e1be66c7d42dbcb3f5f0241d86015bd4d521e65ed8df1a97633b';

// Escrow ABI
const ESCROW_ABI = [
  'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
  'function withdraw(bytes32 _escrowId, bytes32 _secret)',
  'function getEscrow(bytes32 _escrowId) view returns (tuple(address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit))',
  'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)',
  'event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 secret)'
];

async function waitForEvent(eventName, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const socket = io(ORDER_ENGINE_URL);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeout);
    
    socket.on(eventName, (data) => {
      clearTimeout(timer);
      socket.close();
      resolve(data);
    });
  });
}

async function testEndToEndSwap() {
  console.log('🚀 Testing End-to-End ETH → APT Swap');
  console.log('═'.repeat(80));
  
  try {
    // 1. Setup Ethereum provider and signer
    const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);
    const signer = new ethers.Wallet(MAKER_PRIVATE_KEY, provider);
    const escrowContract = new ethers.Contract(ETHEREUM_ESCROW_ADDRESS, ESCROW_ABI, signer);
    
    // 2. Check maker's ETH balance
    const balance = await provider.getBalance(MAKER_ADDRESS);
    console.log(`\n💰 Maker ETH balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther('0.001')) {
      throw new Error('Insufficient ETH balance for test');
    }
    
    // 3. Submit order to order engine
    const order = {
      fromChain: 'ETHEREUM',
      toChain: 'APTOS',
      fromToken: '0x0000000000000000000000000000000000000000',
      toToken: '0x1::aptos_coin::AptosCoin',
      fromAmount: '500000000000000', // 0.0005 ETH
      minToAmount: '41000000', // 0.41 APT
      maker: MAKER_ADDRESS,
      receiver: APTOS_RECEIVER,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      nonce: Date.now().toString(),
      partialFillAllowed: false,
      signature: '0x00' // Dev mode
    };
    
    console.log('\n📤 Submitting order...');
    console.log(`   From: ${parseFloat(order.fromAmount) / 1e18} ETH`);
    console.log(`   To: ${parseFloat(order.minToAmount) / 1e8} APT minimum`);
    
    let response;
    try {
      response = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, order);
    } catch (error) {
      console.error('Failed to submit order:');
      console.error('Status:', error.response?.status);
      console.error('Data:', error.response?.data);
      console.error('Message:', error.message);
      console.error('URL:', error.config?.url);
      throw error;
    }
    const orderId = response.data.data?.id;
    console.log(`✅ Order submitted: ${orderId}`);
    
    // 4. Wait for resolver to create destination escrow
    console.log('\n⏳ Waiting for resolver to create destination escrow...');
    const destEscrowEvent = await waitForEvent('escrow:destination:created');
    console.log('✅ Destination escrow created on Aptos!');
    console.log(`   Secret hash: ${destEscrowEvent.secretHash}`);
    console.log(`   Escrow ID: ${destEscrowEvent.escrowId}`);
    
    // 5. Create source escrow on Ethereum
    console.log('\n💎 Creating source escrow on Ethereum...');
    const escrowId = destEscrowEvent.escrowId;
    const secretHash = destEscrowEvent.secretHash;
    const resolverAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc'; // From .env
    const timelock = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
    const safetyDeposit = ethers.parseEther('0.0001'); // Small safety deposit
    const totalValue = BigInt(order.fromAmount) + safetyDeposit;
    
    const tx = await escrowContract.createEscrow(
      escrowId,
      resolverAddress,
      ethers.ZeroAddress, // token address (0x0 for ETH)
      order.fromAmount,
      secretHash,
      timelock,
      { value: totalValue }
    );
    
    console.log(`   Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ Source escrow created in block ${receipt.blockNumber}`);
    
    // 6. Wait for resolver to reveal secret
    console.log('\n⏳ Waiting for resolver to reveal secret on Ethereum...');
    const secretRevealEvent = await waitForEvent('escrow:source:withdrawn', 60000);
    console.log('✅ Resolver revealed secret and withdrew ETH!');
    console.log(`   Secret: ${secretRevealEvent.secret}`);
    console.log(`   Transaction: ${secretRevealEvent.txHash}`);
    
    // 7. Summary
    console.log('\n✨ Swap completed successfully!');
    console.log('═'.repeat(80));
    console.log('Summary:');
    console.log(`   - Sent: ${parseFloat(order.fromAmount) / 1e18} ETH`);
    console.log(`   - Receiver will get: ~${parseFloat(order.minToAmount) / 1e8} APT`);
    console.log(`   - Aptos receiver: ${APTOS_RECEIVER}`);
    console.log(`   - Secret revealed: ${secretRevealEvent.secret}`);
    console.log('\n🎉 The receiver can now use the secret to claim APT on Aptos!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the test
testEndToEndSwap().catch(console.error);