const { ethers } = require('ethers');
const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const APTOS_NODE = 'https://fullnode.testnet.aptoslabs.com';
const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const ORDER_ENGINE_URL = 'http://localhost:3001';

// Addresses
const addresses = {
  user: '0x4479B0150248772B44B63817c11c589a25957e85',
  resolver: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
  relayer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  escrow: ESCROW_ADDRESS,
  // Aptos addresses
  aptosUser: '0xd7b8a93b8d5a6c473bf96e4ae8b0c5cc57c5c5f5ff38b3819e2c5f4e5f4e5f4e',
  aptosResolver: '0x36f5260acde988971c690510e4f36b166e614e7dc16bb3b86dd19c758e38f577',
  aptosEscrow: '0x36f5260acde988971c690510e4f36b166e614e7dc16bb3b86dd19c758e38f577'
};

// Balance tracking
const balances = {
  before: {
    ethereum: {},
    aptos: {}
  },
  after: {
    ethereum: {},
    aptos: {}
  }
};

// Helper to get Ethereum balance
async function getEthBalance(provider, address) {
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}

// Helper to get Aptos balance
async function getAptosBalance(address) {
  try {
    const response = await axios.post(
      `${APTOS_NODE}/v1/view`,
      {
        function: '0x1::coin::balance',
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [address]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const balance = response.data[0] || 0;
    return (balance / 100000000).toFixed(8); // Convert octas to APT
  } catch (error) {
    return '0.00000000';
  }
}

// Capture all balances
async function captureBalances(provider, phase) {
  console.log(`\n📸 Capturing ${phase} balances...`);
  
  // Ethereum balances
  balances[phase].ethereum.user = await getEthBalance(provider, addresses.user);
  balances[phase].ethereum.resolver = await getEthBalance(provider, addresses.resolver);
  balances[phase].ethereum.relayer = await getEthBalance(provider, addresses.relayer);
  balances[phase].ethereum.escrow = await getEthBalance(provider, addresses.escrow);
  
  // Aptos balances
  balances[phase].aptos.user = await getAptosBalance(addresses.aptosUser);
  balances[phase].aptos.resolver = await getAptosBalance(addresses.aptosResolver);
  balances[phase].aptos.escrow = await getAptosBalance(addresses.aptosEscrow);
}

// Display balance changes
function displayBalanceChanges() {
  console.log('\n📊 BALANCE CHANGES SUMMARY');
  console.log('═'.repeat(80));
  
  console.log('\n🔹 ETHEREUM (Sepolia)');
  console.log('─'.repeat(40));
  console.log('                    BEFORE            →  AFTER              CHANGE');
  console.log('─'.repeat(40));
  
  // User ETH
  const userEthChange = parseFloat(balances.after.ethereum.user) - parseFloat(balances.before.ethereum.user);
  console.log(`User:     ${balances.before.ethereum.user.padEnd(20)} → ${balances.after.ethereum.user.padEnd(20)} ${userEthChange.toFixed(8)} ETH`);
  
  // Resolver ETH
  const resolverEthChange = parseFloat(balances.after.ethereum.resolver) - parseFloat(balances.before.ethereum.resolver);
  console.log(`Resolver: ${balances.before.ethereum.resolver.padEnd(20)} → ${balances.after.ethereum.resolver.padEnd(20)} ${resolverEthChange > 0 ? '+' : ''}${resolverEthChange.toFixed(8)} ETH`);
  
  // Relayer ETH
  const relayerEthChange = parseFloat(balances.after.ethereum.relayer) - parseFloat(balances.before.ethereum.relayer);
  console.log(`Relayer:  ${balances.before.ethereum.relayer.padEnd(20)} → ${balances.after.ethereum.relayer.padEnd(20)} ${relayerEthChange.toFixed(8)} ETH`);
  
  // Escrow ETH
  const escrowEthChange = parseFloat(balances.after.ethereum.escrow) - parseFloat(balances.before.ethereum.escrow);
  console.log(`Escrow:   ${balances.before.ethereum.escrow.padEnd(20)} → ${balances.after.ethereum.escrow.padEnd(20)} ${escrowEthChange.toFixed(8)} ETH`);
  
  console.log('\n🔹 APTOS (Testnet)');
  console.log('─'.repeat(40));
  console.log('                    BEFORE            →  AFTER              CHANGE');
  console.log('─'.repeat(40));
  
  // User APT
  const userAptChange = parseFloat(balances.after.aptos.user) - parseFloat(balances.before.aptos.user);
  console.log(`User:     ${balances.before.aptos.user.padEnd(20)} → ${balances.after.aptos.user.padEnd(20)} ${userAptChange > 0 ? '+' : ''}${userAptChange.toFixed(8)} APT`);
  
  // Resolver APT
  const resolverAptChange = parseFloat(balances.after.aptos.resolver) - parseFloat(balances.before.aptos.resolver);
  console.log(`Resolver: ${balances.before.aptos.resolver.padEnd(20)} → ${balances.after.aptos.resolver.padEnd(20)} ${resolverAptChange.toFixed(8)} APT`);
  
  // Escrow APT
  const escrowAptChange = parseFloat(balances.after.aptos.escrow) - parseFloat(balances.before.aptos.escrow);
  console.log(`Escrow:   ${balances.before.aptos.escrow.padEnd(20)} → ${balances.after.aptos.escrow.padEnd(20)} ${escrowAptChange.toFixed(8)} APT`);
  
  console.log('\n💡 SWAP ANALYSIS');
  console.log('─'.repeat(40));
  
  if (userEthChange < 0 && userAptChange > 0) {
    console.log('✅ User successfully swapped ETH for APT:');
    console.log(`   Sent: ${Math.abs(userEthChange).toFixed(8)} ETH`);
    console.log(`   Received: ${userAptChange.toFixed(8)} APT`);
  } else if (userEthChange < 0 && resolverEthChange > 0) {
    console.log('⏳ Swap in progress:');
    console.log(`   User sent: ${Math.abs(userEthChange).toFixed(8)} ETH`);
    console.log(`   Resolver received: ${resolverEthChange.toFixed(8)} ETH`);
    console.log('   Waiting for user to claim APT on Aptos...');
  } else {
    console.log('❌ Swap not completed or no changes detected');
  }
  
  // Gas costs
  console.log('\n⛽ GAS COSTS');
  console.log('─'.repeat(40));
  const totalUserCost = Math.abs(userEthChange);
  const valueTransferred = Math.abs(resolverEthChange);
  const gasCost = totalUserCost - valueTransferred;
  console.log(`User gas cost: ~${gasCost.toFixed(8)} ETH`);
  
  if (relayerEthChange < 0) {
    console.log(`Relayer gas cost: ${Math.abs(relayerEthChange).toFixed(8)} ETH`);
  }
}

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testBalanceTracking() {
  console.log('🔍 FUSION+ BALANCE TRACKING TEST');
  console.log('═'.repeat(80));
  console.log('This test tracks all balance changes during a cross-chain swap\n');
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  const userWallet = new ethers.Wallet(
    '0x9aa575bac62c0966d497971a4504d8a5b68b198608120553d38da3bba8436efe',
    provider
  );
  
  // Capture initial balances
  await captureBalances(provider, 'before');
  
  // Display initial state
  console.log('\n📊 INITIAL BALANCES');
  console.log('─'.repeat(40));
  console.log('ETHEREUM:');
  console.log(`  User:     ${balances.before.ethereum.user} ETH`);
  console.log(`  Resolver: ${balances.before.ethereum.resolver} ETH`);
  console.log(`  Relayer:  ${balances.before.ethereum.relayer} ETH`);
  console.log(`  Escrow:   ${balances.before.ethereum.escrow} ETH`);
  console.log('\nAPTOS:');
  console.log(`  User:     ${balances.before.aptos.user} APT`);
  console.log(`  Resolver: ${balances.before.aptos.resolver} APT`);
  console.log(`  Escrow:   ${balances.before.aptos.escrow} APT`);
  
  // Check if user has enough balance
  if (parseFloat(balances.before.ethereum.user) < 0.002) {
    console.log('\n⚠️  User needs at least 0.002 ETH to perform swap');
    return;
  }
  
  // Connect to order engine
  console.log('\n🔄 EXECUTING SWAP TEST');
  console.log('─'.repeat(40));
  
  const socket = io(ORDER_ENGINE_URL);
  await new Promise((resolve) => {
    socket.on('connect', () => {
      console.log('✅ Connected to order engine');
      resolve();
    });
  });
  
  // Create order
  console.log('\n1️⃣ Creating swap order (ETH → APT)...');
  const orderData = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress,
    toToken: '0x1::aptos_coin::AptosCoin',
    fromAmount: ethers.parseEther('0.001').toString(),
    minToAmount: '100000000', // 1 APT
    maker: userWallet.address,
    receiver: addresses.aptosUser,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    signature: '0x00'
  };
  
  const orderResponse = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, orderData);
  const order = orderResponse.data.data;
  console.log(`   Order ID: ${order.id}`);
  
  // Wait for resolver to create destination escrow
  console.log('\n2️⃣ Waiting for resolver to create Aptos escrow...');
  await wait(10000);
  
  // Create source escrow
  console.log('\n3️⃣ User creating Ethereum escrow...');
  const escrowAbi = [
    'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
  ];
  
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, userWallet);
  const escrowId = ethers.id(order.id + '-source');
  const amount = ethers.parseEther('0.001');
  const safetyDeposit = ethers.parseEther('0.0001');
  const secretHash = ethers.id('test-secret-' + Date.now());
  const timelock = Math.floor(Date.now() / 1000) + 3600;
  
  const tx = await escrowContract.createEscrow(
    escrowId,
    addresses.resolver,
    ethers.ZeroAddress,
    amount,
    secretHash,
    timelock,
    { value: amount + safetyDeposit }
  );
  
  console.log(`   TX: ${tx.hash}`);
  await tx.wait();
  console.log('   ✅ Escrow created');
  
  // Wait for resolver to withdraw
  console.log('\n4️⃣ Waiting for resolver to detect and withdraw...');
  await wait(30000);
  
  // Capture final balances
  await captureBalances(provider, 'after');
  
  // Display changes
  displayBalanceChanges();
  
  console.log('\n\n🏁 TEST COMPLETE');
  console.log('═'.repeat(80));
  
  socket.disconnect();
}

testBalanceTracking().catch(console.error);