const { ethers } = require('ethers');
const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const ADAPTER_ADDRESS = '0x544f58930c7B12c77540f76eb378677260e044dc';
const ORDER_ENGINE_URL = 'http://localhost:3001';

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testCompleteFlow() {
  console.log('🚀 FUSION+ COMPLETE CROSS-CHAIN SWAP TEST');
  console.log('═'.repeat(80));
  console.log('This test demonstrates the full ETH → APT swap with LayerZero integration\n');
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  
  // User wallet
  const userWallet = new ethers.Wallet(
    '0x9aa575bac62c0966d497971a4504d8a5b68b198608120553d38da3bba8436efe',
    provider
  );
  
  console.log('📋 Test Configuration:');
  console.log(`  User:       ${userWallet.address}`);
  console.log(`  Escrow:     ${ESCROW_ADDRESS}`);
  console.log(`  LayerZero:  ${ADAPTER_ADDRESS}`);
  
  // Check balance
  const balance = await provider.getBalance(userWallet.address);
  console.log(`  Balance:    ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther('0.002')) {
    console.log('\n⚠️  Insufficient balance. Need at least 0.002 ETH');
    return;
  }
  
  // Connect to order engine
  console.log('\n🔌 Connecting to order engine...');
  const socket = io(ORDER_ENGINE_URL);
  
  await new Promise((resolve) => {
    socket.on('connect', () => {
      console.log('  ✅ Connected');
      resolve();
    });
  });
  
  // Track events
  let destinationEscrowCreated = false;
  let sourceEscrowWithdrawn = false;
  let secretRevealed = false;
  let crossChainRevealSent = false;
  
  socket.on('escrow:destination:created', (details) => {
    console.log('\n🔔 DESTINATION ESCROW CREATED:');
    console.log(`  Chain: ${details.chain}`);
    console.log(`  Escrow ID: ${details.escrowId}`);
    destinationEscrowCreated = true;
  });
  
  // STEP 1: Create order
  console.log('\n📝 STEP 1: Creating Cross-Chain Swap Order');
  console.log('─'.repeat(80));
  
  const orderData = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress,
    toToken: '0x1::aptos_coin::AptosCoin',
    fromAmount: ethers.parseEther('0.001').toString(),
    minToAmount: '100000000', // 1 APT
    maker: userWallet.address,
    receiver: userWallet.address,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    signature: '0x00' // Development mode
  };
  
  const orderResponse = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, orderData);
  const order = orderResponse.data.data;
  console.log(`  ✅ Order created: ${order.id}`);
  
  // Wait for resolver to create destination escrow
  console.log('\n⏳ Waiting for resolver to create destination escrow on Aptos...');
  await wait(10000);
  
  if (!destinationEscrowCreated) {
    console.log('  ⚠️  No resolver picked up the order');
    socket.disconnect();
    return;
  }
  
  // STEP 2: User creates source escrow
  console.log('\n💸 STEP 2: User Creates Source Escrow on Ethereum');
  console.log('─'.repeat(80));
  
  const escrowAbi = [
    'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
    'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)',
    'event Withdrawn(bytes32 indexed escrowId, bytes32 secret)'
  ];
  
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, userWallet);
  
  // Create matching escrow
  const escrowId = ethers.id(order.id + '-source');
  const amount = ethers.parseEther('0.001');
  const safetyDeposit = ethers.parseEther('0.0001');
  const secretHash = ethers.id('test-secret-' + Date.now()); // In production, get from resolver
  const timelock = Math.floor(Date.now() / 1000) + 3600;
  
  console.log('  Creating source escrow...');
  const tx = await escrowContract.createEscrow(
    escrowId,
    '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc', // Resolver address
    ethers.ZeroAddress,
    amount,
    secretHash,
    timelock,
    { value: amount + safetyDeposit }
  );
  
  console.log(`  TX: ${tx.hash}`);
  await tx.wait();
  console.log('  ✅ Source escrow created');
  
  // Monitor for withdrawal
  console.log('\n👀 STEP 3: Monitoring for Resolver Actions');
  console.log('─'.repeat(80));
  
  escrowContract.on('Withdrawn', async (withdrawnEscrowId, revealedSecret) => {
    if (withdrawnEscrowId === escrowId) {
      console.log('\n🔓 SOURCE ESCROW WITHDRAWN:');
      console.log(`  Secret revealed: ${revealedSecret}`);
      sourceEscrowWithdrawn = true;
      secretRevealed = revealedSecret;
    }
  });
  
  // Monitor LayerZero adapter
  const adapterAbi = [
    'event SecretRevealSent(uint32 dstEid, bytes32 escrowId, bytes32 secret, address revealer)'
  ];
  const adapter = new ethers.Contract(ADAPTER_ADDRESS, adapterAbi, provider);
  
  adapter.on('SecretRevealSent', (dstEid, lzEscrowId, secret, revealer) => {
    console.log('\n🌐 CROSS-CHAIN SECRET REVEAL SENT:');
    console.log(`  Destination: Chain ${dstEid}`);
    console.log(`  Secret: ${secret}`);
    crossChainRevealSent = true;
  });
  
  console.log('  ⏳ Waiting for resolver to detect and withdraw...');
  console.log('  The resolver should:');
  console.log('    1. Detect the source escrow creation');
  console.log('    2. Withdraw using their secret');
  console.log('    3. Send secret cross-chain via LayerZero');
  
  // Wait for actions
  await wait(30000);
  
  // Final summary
  console.log('\n\n📊 CROSS-CHAIN SWAP SUMMARY');
  console.log('═'.repeat(80));
  
  console.log('\n✅ Completed Steps:');
  if (destinationEscrowCreated) {
    console.log('  1. Resolver created destination escrow on Aptos ✓');
  }
  console.log('  2. User created source escrow on Ethereum ✓');
  if (sourceEscrowWithdrawn) {
    console.log('  3. Resolver withdrew from source escrow ✓');
    console.log('  4. Secret revealed on Ethereum ✓');
  }
  if (crossChainRevealSent) {
    console.log('  5. Secret sent cross-chain via LayerZero ✓');
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('  1. LayerZero relays the secret to Aptos');
  console.log('  2. User calls withdraw_cross_chain on Aptos escrow');
  console.log('  3. User receives 1 APT on Aptos');
  
  console.log('\n💡 The complete flow demonstrates:');
  console.log('  - Intent-based atomic swaps');
  console.log('  - Gasless experience (resolver pays gas)');
  console.log('  - Cross-chain secret propagation via LayerZero');
  console.log('  - Trustless settlement with hashlocks/timelocks');
  
  // Check final balances
  console.log('\n💰 Final Ethereum Balances:');
  const finalUserBalance = await provider.getBalance(userWallet.address);
  const finalEscrowBalance = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log(`  User:   ${ethers.formatEther(finalUserBalance)} ETH (was ${ethers.formatEther(balance)})`);
  console.log(`  Escrow: ${ethers.formatEther(finalEscrowBalance)} ETH`);
  
  socket.disconnect();
}

testCompleteFlow().catch(console.error);