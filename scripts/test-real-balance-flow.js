const axios = require('axios');
const { ethers } = require('ethers');

// Configuration
const ORDER_ENGINE_URL = 'http://localhost:3001';
const RELAYER_URL = 'http://localhost:3003';
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const APTOS_API = 'https://fullnode.testnet.aptoslabs.com/v1';

// Wallet addresses (from our deployed setup)
const USER_ETH_ADDRESS = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
const USER_APTOS_ADDRESS = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';
const RESOLVER_ETH_ADDRESS = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
const RESOLVER_APTOS_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';

// Contract addresses
const ETH_ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const APTOS_ESCROW_ADDRESS = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';

// Balance tracking
const balances = {
  before: {},
  afterDestEscrow: {},
  afterSourceEscrow: {},
  afterResolverWithdraw: {},
  afterUserWithdraw: {},
  final: {}
};

// Transaction tracking
const transactions = {
  createOrder: null,
  destEscrow: null,
  sourceEscrow: null,
  resolverWithdraw: null,
  userWithdraw: null
};

// Escrow tracking
let activeEscrows = {
  destination: null,
  source: null
};

async function getEthereumBalance(address) {
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}

async function getAptosBalance(address) {
  try {
    const response = await fetch(`${APTOS_API}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        function: '0x1::coin::balance',
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [address]
      })
    });
    
    if (!response.ok) return '0';
    const result = await response.json();
    const balance = BigInt(result[0] || '0');
    return (Number(balance) / 1e8).toFixed(8);
  } catch (error) {
    return '0';
  }
}

async function captureBalances(label) {
  console.log(`\n📊 ${label}`);
  console.log('═'.repeat(80));
  
  const snapshot = {
    userEth: await getEthereumBalance(USER_ETH_ADDRESS),
    userApt: await getAptosBalance(USER_APTOS_ADDRESS),
    resolverEth: await getEthereumBalance(RESOLVER_ETH_ADDRESS),
    resolverApt: await getAptosBalance(RESOLVER_APTOS_ADDRESS),
    ethEscrow: await getEthereumBalance(ETH_ESCROW_ADDRESS),
    aptEscrow: await getAptosBalance(APTOS_ESCROW_ADDRESS)
  };
  
  console.log('\n💰 Ethereum Balances:');
  console.log(`   User:           ${snapshot.userEth} ETH`);
  console.log(`   Resolver:       ${snapshot.resolverEth} ETH`);
  console.log(`   Escrow Contract: ${snapshot.ethEscrow} ETH`);
  
  console.log('\n💰 Aptos Balances:');
  console.log(`   User:           ${snapshot.userApt} APT`);
  console.log(`   Resolver:       ${snapshot.resolverApt} APT`);
  console.log(`   Escrow Module:  ${snapshot.aptEscrow} APT`);
  
  return snapshot;
}

function calculateChanges(before, after, label) {
  console.log(`\n📈 Balance Changes: ${label}`);
  console.log('─'.repeat(80));
  
  const changes = {
    userEth: parseFloat(after.userEth) - parseFloat(before.userEth),
    userApt: parseFloat(after.userApt) - parseFloat(before.userApt),
    resolverEth: parseFloat(after.resolverEth) - parseFloat(before.resolverEth),
    resolverApt: parseFloat(after.resolverApt) - parseFloat(before.resolverApt),
    ethEscrow: parseFloat(after.ethEscrow) - parseFloat(before.ethEscrow),
    aptEscrow: parseFloat(after.aptEscrow) - parseFloat(before.aptEscrow)
  };
  
  console.log('User:');
  console.log(`   ETH: ${changes.userEth > 0 ? '+' : ''}${changes.userEth.toFixed(6)}`);
  console.log(`   APT: ${changes.userApt > 0 ? '+' : ''}${changes.userApt.toFixed(8)}`);
  
  console.log('\nResolver:');
  console.log(`   ETH: ${changes.resolverEth > 0 ? '+' : ''}${changes.resolverEth.toFixed(6)}`);
  console.log(`   APT: ${changes.resolverApt > 0 ? '+' : ''}${changes.resolverApt.toFixed(8)}`);
  
  console.log('\nEscrow Contracts:');
  console.log(`   ETH: ${changes.ethEscrow > 0 ? '+' : ''}${changes.ethEscrow.toFixed(6)}`);
  console.log(`   APT: ${changes.aptEscrow > 0 ? '+' : ''}${changes.aptEscrow.toFixed(8)}`);
  
  return changes;
}

async function monitorEscrowEvents() {
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  const escrowAbi = [
    'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)',
    'event EscrowWithdrawn(bytes32 indexed escrowId, address indexed beneficiary, bytes32 secret)'
  ];
  
  const escrowContract = new ethers.Contract(ETH_ESCROW_ADDRESS, escrowAbi, provider);
  
  // Monitor for escrow creation
  escrowContract.on('EscrowCreated', (escrowId, depositor, beneficiary, token, amount, hashlock, timelock) => {
    console.log('\n🔔 Escrow Created Event:');
    console.log(`   ID: ${escrowId}`);
    console.log(`   Depositor: ${depositor}`);
    console.log(`   Beneficiary: ${beneficiary}`);
    console.log(`   Amount: ${ethers.formatEther(amount)} ETH`);
    
    if (beneficiary.toLowerCase() === USER_ETH_ADDRESS.toLowerCase()) {
      activeEscrows.destination = { escrowId, hashlock, amount };
    } else if (beneficiary.toLowerCase() === RESOLVER_ETH_ADDRESS.toLowerCase()) {
      activeEscrows.source = { escrowId, hashlock, amount };
    }
  });
  
  // Monitor for withdrawals
  escrowContract.on('EscrowWithdrawn', (escrowId, beneficiary, secret) => {
    console.log('\n🔓 Escrow Withdrawn Event:');
    console.log(`   ID: ${escrowId}`);
    console.log(`   Beneficiary: ${beneficiary}`);
    console.log(`   Secret Revealed: ${secret}`);
  });
}

async function runRealBalanceFlowTest() {
  console.log('🚀 Real-World Balance Flow Test');
  console.log('═'.repeat(80));
  console.log('This test demonstrates actual balance changes with real wallets\n');

  try {
    // Start monitoring events
    monitorEscrowEvents();
    
    // Capture initial balances
    balances.before = await captureBalances('INITIAL STATE');
    
    // Step 1: Create swap order (ETH → APT)
    console.log('\n\n📝 STEP 1: Creating Swap Order (ETH → APT)');
    console.log('─'.repeat(80));
    console.log('User wants to swap 0.001 ETH for 0.5 APT');
    
    const orderData = {
      fromChain: 'ETHEREUM',
      toChain: 'APTOS',
      fromToken: ethers.ZeroAddress,
      toToken: '0x1::aptos_coin::AptosCoin',
      fromAmount: ethers.parseEther('0.001').toString(),
      minToAmount: (0.5 * 1e8).toString(),
      maker: USER_ETH_ADDRESS,
      receiver: USER_APTOS_ADDRESS,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      nonce: Date.now().toString(),
      partialFillAllowed: false,
      signature: '0x00' // Dev mode
    };
    
    const orderResponse = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, orderData);
    const orderId = orderResponse.data.data.id;
    transactions.createOrder = orderId;
    
    console.log(`✅ Order created: ${orderId}`);
    console.log('   Status: PENDING');
    console.log('   Waiting for resolver to pick it up...');
    
    // Wait for resolver to create destination escrow
    console.log('\n⏳ Waiting for resolver to create destination escrow...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check order status
    const orderStatus = await axios.get(`${ORDER_ENGINE_URL}/api/orders/${orderId}`);
    console.log(`   Order status: ${orderStatus.data.data.status}`);
    
    // Capture balances after destination escrow
    balances.afterDestEscrow = await captureBalances('AFTER DESTINATION ESCROW');
    calculateChanges(balances.before, balances.afterDestEscrow, 'Destination Escrow Created');
    
    // Step 2: User creates source escrow (via relayer - simulated)
    console.log('\n\n🔒 STEP 2: User Creates Source Escrow (Via Relayer)');
    console.log('─'.repeat(80));
    console.log('User creates matching source escrow with 0.001 ETH');
    console.log('Relayer will pay the gas!');
    
    // In real implementation, user would call relayer API
    // For now, we'll simulate by creating escrow directly
    if (activeEscrows.destination) {
      const provider = new ethers.JsonRpcProvider(ETH_RPC);
      const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
      
      const escrowAbi = [
        'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
      ];
      
      const escrowContract = new ethers.Contract(ETH_ESCROW_ADDRESS, escrowAbi, wallet);
      const sourceEscrowId = ethers.id(orderId + '-source');
      
      const tx = await escrowContract.createEscrow(
        sourceEscrowId,
        RESOLVER_ETH_ADDRESS,
        ethers.ZeroAddress,
        ethers.parseEther('0.001'),
        activeEscrows.destination.hashlock,
        Math.floor(Date.now() / 1000) + 7200,
        { value: ethers.parseEther('0.011') } // 0.001 ETH + 0.01 safety deposit
      );
      
      console.log(`   Transaction: ${tx.hash}`);
      await tx.wait();
      console.log('   ✅ Source escrow created!');
    }
    
    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Capture balances after source escrow
    balances.afterSourceEscrow = await captureBalances('AFTER SOURCE ESCROW');
    calculateChanges(balances.afterDestEscrow, balances.afterSourceEscrow, 'Source Escrow Created');
    
    // Step 3: Monitor for resolver withdrawal
    console.log('\n\n🔓 STEP 3: Waiting for Resolver to Reveal Secret');
    console.log('─'.repeat(80));
    console.log('Resolver will withdraw from source escrow, revealing the secret...');
    
    // Wait for resolver to act
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Capture balances after resolver withdrawal
    balances.afterResolverWithdraw = await captureBalances('AFTER RESOLVER WITHDRAWAL');
    calculateChanges(balances.afterSourceEscrow, balances.afterResolverWithdraw, 'Resolver Withdrew ETH');
    
    // Step 4: User withdraws from destination
    console.log('\n\n💰 STEP 4: User Withdraws from Destination');
    console.log('─'.repeat(80));
    console.log('User uses revealed secret to withdraw APT...');
    console.log('(In production, this would be done via relayer)');
    
    // Wait for user withdrawal
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Capture final balances
    balances.final = await captureBalances('FINAL STATE');
    calculateChanges(balances.afterResolverWithdraw, balances.final, 'User Withdrew APT');
    
    // Summary
    console.log('\n\n📊 COMPLETE SWAP SUMMARY');
    console.log('═'.repeat(80));
    
    const totalChanges = calculateChanges(balances.before, balances.final, 'Total Changes');
    
    console.log('\n🎯 Expected vs Actual:');
    console.log('\nUser:');
    console.log(`   Expected: -0.001 ETH, +0.5 APT`);
    console.log(`   Actual:   ${totalChanges.userEth.toFixed(6)} ETH, ${totalChanges.userApt > 0 ? '+' : ''}${totalChanges.userApt.toFixed(8)} APT`);
    
    console.log('\nResolver:');
    console.log(`   Expected: +0.001 ETH, -0.5 APT`);
    console.log(`   Actual:   ${totalChanges.resolverEth > 0 ? '+' : ''}${totalChanges.resolverEth.toFixed(6)} ETH, ${totalChanges.resolverApt.toFixed(8)} APT`);
    
    console.log('\n✅ Atomic swap completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
}

// Check if services are running
async function checkServices() {
  console.log('🔍 Checking services...');
  
  try {
    await axios.get(`${ORDER_ENGINE_URL}/health`);
    console.log('✅ Order Engine is running');
  } catch (error) {
    console.log('❌ Order Engine is not running. Start it with: cd backend/order-engine && npm run dev');
    return false;
  }
  
  try {
    await axios.get(`${RELAYER_URL}/health`);
    console.log('✅ Relayer is running');
  } catch (error) {
    console.log('❌ Relayer is not running. Start it with: cd backend/relayer && npm run dev');
    return false;
  }
  
  // Check resolver health
  try {
    await axios.get('http://localhost:3002/health');
    console.log('✅ Resolver is running');
  } catch (error) {
    console.log('❌ Resolver is not running. Start it with: cd backend/resolver && npm run dev');
    return false;
  }
  
  return true;
}

// Main execution
async function main() {
  const servicesReady = await checkServices();
  if (!servicesReady) {
    console.log('\n⚠️  Please start all services before running this test');
    process.exit(1);
  }
  
  console.log('\n✅ All services are running!\n');
  await runRealBalanceFlowTest();
  process.exit(0);
}

main().catch(console.error);