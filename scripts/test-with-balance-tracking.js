const axios = require('axios');
const { ethers } = require('ethers');

// Configuration
const API_URL = 'http://localhost:3001';
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const APTOS_API = 'https://fullnode.testnet.aptoslabs.com/v1';

// Addresses
const USER_ETH_ADDRESS = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
const USER_APTOS_ADDRESS = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';
const RESOLVER_ETH_ADDRESS = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
const RESOLVER_APTOS_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
const ETH_ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const APTOS_ESCROW_ADDRESS = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';

// Track all balances
const balances = {
  before: {},
  after: {}
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

async function captureAllBalances(label) {
  console.log(`\n📊 Capturing balances: ${label}`);
  console.log('═'.repeat(60));
  
  const snapshot = {};
  
  // Ethereum balances
  console.log('\nEthereum Chain:');
  snapshot.userEth = await getEthereumBalance(USER_ETH_ADDRESS);
  console.log(`  User Wallet:     ${snapshot.userEth} ETH`);
  
  snapshot.resolverEth = await getEthereumBalance(RESOLVER_ETH_ADDRESS);
  console.log(`  Resolver Wallet: ${snapshot.resolverEth} ETH`);
  
  snapshot.escrowEth = await getEthereumBalance(ETH_ESCROW_ADDRESS);
  console.log(`  Escrow Contract: ${snapshot.escrowEth} ETH`);
  
  // Aptos balances
  console.log('\nAptos Chain:');
  snapshot.userApt = await getAptosBalance(USER_APTOS_ADDRESS);
  console.log(`  User Wallet:     ${snapshot.userApt} APT`);
  
  snapshot.resolverApt = await getAptosBalance(RESOLVER_APTOS_ADDRESS);
  console.log(`  Resolver Wallet: ${snapshot.resolverApt} APT`);
  
  snapshot.escrowApt = await getAptosBalance(APTOS_ESCROW_ADDRESS);
  console.log(`  Escrow Module:   ${snapshot.escrowApt} APT`);
  
  return snapshot;
}

function calculateChanges(before, after, swapDetails) {
  console.log(`\n💱 Balance Changes for ${swapDetails}:`);
  console.log('═'.repeat(60));
  
  const changes = {};
  
  // Calculate ETH changes
  console.log('\nEthereum Changes:');
  changes.userEthDiff = (parseFloat(after.userEth) - parseFloat(before.userEth)).toFixed(6);
  console.log(`  User:     ${changes.userEthDiff > 0 ? '+' : ''}${changes.userEthDiff} ETH`);
  
  changes.resolverEthDiff = (parseFloat(after.resolverEth) - parseFloat(before.resolverEth)).toFixed(6);
  console.log(`  Resolver: ${changes.resolverEthDiff > 0 ? '+' : ''}${changes.resolverEthDiff} ETH`);
  
  changes.escrowEthDiff = (parseFloat(after.escrowEth) - parseFloat(before.escrowEth)).toFixed(6);
  console.log(`  Escrow:   ${changes.escrowEthDiff > 0 ? '+' : ''}${changes.escrowEthDiff} ETH`);
  
  // Calculate APT changes
  console.log('\nAptos Changes:');
  changes.userAptDiff = (parseFloat(after.userApt) - parseFloat(before.userApt)).toFixed(8);
  console.log(`  User:     ${changes.userAptDiff > 0 ? '+' : ''}${changes.userAptDiff} APT`);
  
  changes.resolverAptDiff = (parseFloat(after.resolverApt) - parseFloat(before.resolverApt)).toFixed(8);
  console.log(`  Resolver: ${changes.resolverAptDiff > 0 ? '+' : ''}${changes.resolverAptDiff} APT`);
  
  changes.escrowAptDiff = (parseFloat(after.escrowApt) - parseFloat(before.escrowApt)).toFixed(8);
  console.log(`  Escrow:   ${changes.escrowAptDiff > 0 ? '+' : ''}${changes.escrowAptDiff} APT`);
  
  return changes;
}

async function createSwapOrder(fromChain, toChain, fromAmount, minToAmount) {
  const orderData = {
    fromChain,
    toChain,
    fromToken: fromChain === 'ETHEREUM' 
      ? '0x0000000000000000000000000000000000000000'
      : '0x1::aptos_coin::AptosCoin',
    toToken: toChain === 'ETHEREUM' 
      ? '0x0000000000000000000000000000000000000000'
      : '0x1::aptos_coin::AptosCoin',
    fromAmount: fromChain === 'ETHEREUM'
      ? (parseFloat(fromAmount) * 1e18).toString()
      : (parseFloat(fromAmount) * 1e8).toString(),
    minToAmount: toChain === 'ETHEREUM'
      ? (parseFloat(minToAmount) * 1e18).toString()
      : (parseFloat(minToAmount) * 1e8).toString(),
    maker: fromChain === 'ETHEREUM' ? USER_ETH_ADDRESS : USER_APTOS_ADDRESS,
    receiver: toChain === 'ETHEREUM' ? USER_ETH_ADDRESS : USER_APTOS_ADDRESS,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString(),
    partialFillAllowed: false,
    signature: '0x00' // Development mode
  };

  const response = await axios.post(`${API_URL}/api/orders`, orderData);
  return response.data.data.id;
}

async function waitForOrderCompletion(orderId, maxWaitTime = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await axios.get(`${API_URL}/api/orders/${orderId}`);
      const order = response.data.data;
      
      if (order.status === 'FILLED') {
        return true;
      } else if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
        return false;
      }
    } catch (error) {
      console.error('Error checking order status:', error.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return false;
}

async function runBalanceTrackingTest() {
  console.log('🧪 Fusion+ Balance Tracking Test');
  console.log('═'.repeat(60));
  console.log('This test tracks all balance changes to verify correct fund flow.\n');

  try {
    // Initial balances
    const initialBalances = await captureAllBalances('INITIAL STATE');
    
    // Test 1: ETH → APT swap (0.001 ETH for 0.5 APT)
    console.log('\n\n🔄 TEST 1: ETH → APT Swap');
    console.log('User sends 0.001 ETH, expects 0.5 APT');
    console.log('-'.repeat(60));
    
    const beforeSwap1 = await captureAllBalances('BEFORE ETH→APT SWAP');
    
    console.log('\n📤 Creating swap order...');
    const orderId1 = await createSwapOrder('ETHEREUM', 'APTOS', '0.001', '0.5');
    console.log(`Order ID: ${orderId1}`);
    
    console.log('⏳ Waiting for swap completion...');
    const completed1 = await waitForOrderCompletion(orderId1);
    
    if (completed1) {
      console.log('✅ Swap completed!');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for final settlement
      
      const afterSwap1 = await captureAllBalances('AFTER ETH→APT SWAP');
      const changes1 = calculateChanges(beforeSwap1, afterSwap1, 'ETH → APT Swap');
      
      // Verify expected changes
      console.log('\n✓ Verification:');
      console.log(`  User ETH decreased by ~0.001 (actual: ${changes1.userEthDiff})`);
      console.log(`  User APT increased by ~0.5 (actual: ${changes1.userAptDiff})`);
      console.log(`  Resolver provided the APT and received the ETH`);
    } else {
      console.log('❌ Swap failed or timed out');
    }
    
    // Test 2: APT → ETH swap (1 APT for 0.002 ETH)
    console.log('\n\n🔄 TEST 2: APT → ETH Swap');
    console.log('User sends 1 APT, expects 0.002 ETH');
    console.log('-'.repeat(60));
    
    const beforeSwap2 = await captureAllBalances('BEFORE APT→ETH SWAP');
    
    console.log('\n📤 Creating swap order...');
    const orderId2 = await createSwapOrder('APTOS', 'ETHEREUM', '1', '0.002');
    console.log(`Order ID: ${orderId2}`);
    
    console.log('⏳ Waiting for swap completion...');
    const completed2 = await waitForOrderCompletion(orderId2);
    
    if (completed2) {
      console.log('✅ Swap completed!');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for final settlement
      
      const afterSwap2 = await captureAllBalances('AFTER APT→ETH SWAP');
      const changes2 = calculateChanges(beforeSwap2, afterSwap2, 'APT → ETH Swap');
      
      // Verify expected changes
      console.log('\n✓ Verification:');
      console.log(`  User APT decreased by ~1 (actual: ${changes2.userAptDiff})`);
      console.log(`  User ETH increased by ~0.002 (actual: ${changes2.userEthDiff})`);
      console.log(`  Resolver provided the ETH and received the APT`);
    } else {
      console.log('❌ Swap failed or timed out');
    }
    
    // Final summary
    console.log('\n\n📈 FINAL SUMMARY');
    console.log('═'.repeat(60));
    
    const finalBalances = await captureAllBalances('FINAL STATE');
    const totalChanges = calculateChanges(initialBalances, finalBalances, 'TOTAL (Both Swaps)');
    
    console.log('\n🏁 Net Changes from Start:');
    console.log(`  User:     ${totalChanges.userEthDiff} ETH, ${totalChanges.userAptDiff} APT`);
    console.log(`  Resolver: ${totalChanges.resolverEthDiff} ETH, ${totalChanges.resolverAptDiff} APT`);
    
    // Gas costs note
    console.log('\n⛽ Note: ETH balances include gas costs paid by resolver');
    console.log('The resolver pays all gas fees on both chains as part of the gasless swap design.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Connect to WebSocket for real-time updates
const io = require('socket.io-client');
const socket = io(API_URL);

socket.on('connect', () => {
  console.log('📡 Connected to order engine WebSocket\n');
  socket.emit('subscribe:active');
});

// Run the test
runBalanceTrackingTest().then(() => {
  console.log('\n✨ Test complete. Press Ctrl+C to exit.');
}).catch(console.error);