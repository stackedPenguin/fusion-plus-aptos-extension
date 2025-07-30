const { ethers } = require('ethers');
const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const ORDER_ENGINE_URL = 'http://localhost:3001';
const RELAYER_URL = 'http://localhost:3003';

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testFullIntegration() {
  console.log('🚀 FUSION+ FULL INTEGRATION TEST');
  console.log('═'.repeat(80));
  console.log('This test demonstrates the complete swap flow with actual balance transfers\n');
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  
  // Test wallets
  const userWallet = new ethers.Wallet(
    '0x9aa575bac62c0966d497971a4504d8a5b68b198608120553d38da3bba8436efe', // new user wallet
    provider
  );
  
  // Resolver uses the configured wallet
  const resolverPrivateKey = process.env.ETHEREUM_PRIVATE_KEY || 
    'c8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74';
  const resolverWallet = new ethers.Wallet(resolverPrivateKey, provider);
  
  console.log('📋 Test Setup:');
  console.log(`  User wallet:     ${userWallet.address}`);
  console.log(`  Resolver wallet: ${resolverWallet.address}`);
  console.log(`  Escrow contract: ${ESCROW_ADDRESS}`);
  
  // Check initial balances
  console.log('\n💰 Initial Balances:');
  const userBalance = await provider.getBalance(userWallet.address);
  const resolverBalance = await provider.getBalance(resolverWallet.address);
  const escrowBalance = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log(`  User:     ${ethers.formatEther(userBalance)} ETH`);
  console.log(`  Resolver: ${ethers.formatEther(resolverBalance)} ETH`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalance)} ETH`);
  
  if (userBalance < ethers.parseEther('0.002')) {
    console.log('\n⚠️  User needs at least 0.002 ETH for test. Please fund the wallet.');
    return;
  }
  
  // Connect to order engine via WebSocket
  console.log('\n🔌 Connecting to order engine...');
  const socket = io(ORDER_ENGINE_URL);
  
  await new Promise((resolve) => {
    socket.on('connect', () => {
      console.log('  ✅ Connected to order engine');
      resolve();
    });
  });
  
  // Subscribe to escrow events
  let destinationEscrowCreated = false;
  let destinationEscrowDetails = null;
  
  socket.on('escrow:destination:created', (details) => {
    console.log('\n🔔 DESTINATION ESCROW CREATED EVENT:');
    console.log(`  Order ID: ${details.orderId}`);
    console.log(`  Escrow ID: ${details.escrowId}`);
    console.log(`  Chain: ${details.chain}`);
    console.log(`  Secret Hash: ${details.secretHash}`);
    console.log(`  TX: ${details.txHash}`);
    destinationEscrowCreated = true;
    destinationEscrowDetails = details;
  });
  
  // STEP 1: Create an order
  console.log('\n📝 STEP 1: Creating Order (ETH → APT)');
  console.log('─'.repeat(80));
  
  const orderData = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress,
    toToken: '0x1::aptos_coin::AptosCoin',
    fromAmount: ethers.parseEther('0.001').toString(),
    minToAmount: '100000000', // 1 APT (8 decimals)
    maker: userWallet.address,
    receiver: userWallet.address, // Same user receives on Aptos
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString(),
    signature: '0x00' // Development mode
  };
  
  let order;
  try {
    const orderResponse = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, orderData);
    order = orderResponse.data.data;
    console.log(`  ✅ Order created: ${order.id}`);
    console.log(`  Status: ${order.status}`);
  } catch (error) {
    console.error('  ❌ Failed to create order:', error.response?.data || error.message);
    socket.disconnect();
    return;
  }
  
  // Wait for resolver to create destination escrow
  console.log('\n⏳ Waiting for resolver to create destination escrow...');
  
  // Wait up to 15 seconds for destination escrow
  let waited = 0;
  while (!destinationEscrowCreated && waited < 15000) {
    await wait(1000);
    waited += 1000;
  }
  
  if (!destinationEscrowCreated) {
    console.log('  ⚠️  No resolver picked up the order yet');
    socket.disconnect();
    return;
  }
  
  console.log('  ✅ Resolver created destination escrow!');
  
  // STEP 2: User creates source escrow (matching the resolver's)
  console.log('\n💸 STEP 2: User Creates Source Escrow');
  console.log('─'.repeat(80));
  
  const escrowAbi = [
    'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
  ];
  
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, userWallet);
  
  // Use matching parameters from destination escrow
  const sourceEscrowId = ethers.id(order.id + '-source-' + destinationEscrowDetails.secretHash);
  const amount = ethers.parseEther('0.001');
  const safetyDeposit = ethers.parseEther('0.0001');
  const totalValue = amount + safetyDeposit;
  
  console.log('  Creating source escrow with:');
  console.log(`    Escrow ID: ${sourceEscrowId}`);
  console.log(`    Beneficiary: ${resolverWallet.address}`);
  console.log(`    Amount: ${ethers.formatEther(amount)} ETH`);
  console.log(`    Safety: ${ethers.formatEther(safetyDeposit)} ETH`);
  console.log(`    Secret Hash: ${destinationEscrowDetails.secretHash}`);
  
  try {
    const tx = await escrowContract.createEscrow(
      sourceEscrowId,
      resolverWallet.address, // Resolver is beneficiary on source
      ethers.ZeroAddress, // ETH
      amount,
      destinationEscrowDetails.secretHash,
      destinationEscrowDetails.timelock,
      { value: totalValue }
    );
    
    console.log(`  TX submitted: ${tx.hash}`);
    console.log('  Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log(`  ✅ Source escrow created in block ${receipt.blockNumber}`);
    
  } catch (error) {
    console.error('  ❌ Failed to create source escrow:', error.message);
    socket.disconnect();
    return;
  }
  
  // Check balances after escrow creation
  console.log('\n💰 Balances After Source Escrow:');
  const userBalance2 = await provider.getBalance(userWallet.address);
  const escrowBalance2 = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log(`  User:     ${ethers.formatEther(userBalance2)} ETH (was ${ethers.formatEther(userBalance)})`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalance2)} ETH (was ${ethers.formatEther(escrowBalance)})`);
  console.log(`  Locked:   ${ethers.formatEther(userBalance - userBalance2 - BigInt(500000000000000))} ETH (approx, minus gas)`);
  
  // Wait for resolver to detect and withdraw
  console.log('\n⏳ Waiting for resolver to detect source escrow and reveal secret...');
  console.log('  The resolver should:');
  console.log('    1. Detect the source escrow creation');
  console.log('    2. Reveal the secret by withdrawing');
  console.log('    3. This makes the secret available on-chain');
  
  await wait(25000); // Wait for resolver to process
  
  // Check final balances
  console.log('\n💰 Final Balances:');
  const userBalance3 = await provider.getBalance(userWallet.address);
  const resolverBalance3 = await provider.getBalance(resolverWallet.address);
  const escrowBalance3 = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log(`  User:     ${ethers.formatEther(userBalance3)} ETH`);
  console.log(`  Resolver: ${ethers.formatEther(resolverBalance3)} ETH`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalance3)} ETH`);
  
  // Summary
  console.log('\n\n📊 SWAP SUMMARY');
  console.log('═'.repeat(80));
  
  const userLost = userBalance - userBalance3;
  const resolverGained = resolverBalance3 - resolverBalance;
  
  console.log('\n💸 Token Flow:');
  console.log(`  User sent:     ~${ethers.formatEther(userLost)} ETH (including gas)`);
  console.log(`  Resolver got:  ~${ethers.formatEther(resolverGained)} ETH`);
  
  if (resolverGained > ethers.parseEther('0.0009')) {
    console.log('\n✅ SUCCESS! Value was transferred from user to resolver');
    console.log('  - User locked ETH in source escrow');
    console.log('  - Resolver locked APT in destination escrow');
    console.log('  - Resolver withdrew ETH using secret');
    console.log('  - User can now use revealed secret to claim APT');
  } else {
    console.log('\n⚠️  Swap may not have completed. Check resolver logs.');
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('  1. User monitors blockchain for revealed secret');
  console.log('  2. User uses secret to withdraw from Aptos escrow');
  console.log('  3. User receives 1 APT on Aptos chain');
  
  socket.disconnect();
}

testFullIntegration().catch(console.error);