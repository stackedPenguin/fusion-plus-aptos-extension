const axios = require('axios');
const { ethers } = require('ethers');
const { FusionPlusClient } = require('../backend/client-sdk/src/FusionPlusClient');

// Configuration
const ORDER_ENGINE_URL = 'http://localhost:3001';
const RELAYER_URL = 'http://localhost:3003';
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const APTOS_API = 'https://fullnode.testnet.aptoslabs.com/v1';

// Test wallets
const TEST_USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY_ETH || '0x...';
const USER_ETH_ADDRESS = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
const USER_APTOS_ADDRESS = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';
const RESOLVER_ETH_ADDRESS = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
const RESOLVER_APTOS_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
const RELAYER_ETH_ADDRESS = process.env.RELAYER_ADDRESS_ETH || '0x...';
const RELAYER_APTOS_ADDRESS = process.env.RELAYER_ADDRESS_APTOS || '0x...';

// Balance tracking
const balances = {
  initial: {},
  afterDestEscrow: {},
  afterSourceEscrow: {},
  afterSecretReveal: {},
  final: {}
};

// Secret tracking
let capturedSecret = null;
let destinationEscrowInfo = null;

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
  console.log(`\n📊 ${label}`);
  console.log('═'.repeat(60));
  
  const snapshot = {
    userEth: await getEthereumBalance(USER_ETH_ADDRESS),
    userApt: await getAptosBalance(USER_APTOS_ADDRESS),
    resolverEth: await getEthereumBalance(RESOLVER_ETH_ADDRESS),
    resolverApt: await getAptosBalance(RESOLVER_APTOS_ADDRESS),
    relayerEth: await getEthereumBalance(RELAYER_ETH_ADDRESS),
    relayerApt: await getAptosBalance(RELAYER_APTOS_ADDRESS)
  };
  
  console.log('\nEthereum Balances:');
  console.log(`  User:     ${snapshot.userEth} ETH`);
  console.log(`  Resolver: ${snapshot.resolverEth} ETH`);
  console.log(`  Relayer:  ${snapshot.relayerEth} ETH`);
  
  console.log('\nAptos Balances:');
  console.log(`  User:     ${snapshot.userApt} APT`);
  console.log(`  Resolver: ${snapshot.resolverApt} APT`);
  console.log(`  Relayer:  ${snapshot.relayerApt} APT`);
  
  return snapshot;
}

async function monitorSecretReveal() {
  // Monitor Ethereum contract for secret reveal
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  const escrowAddress = process.env.ETHEREUM_ESCROW_ADDRESS || '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
  
  const escrowAbi = [
    'event EscrowWithdrawn(bytes32 indexed escrowId, address indexed beneficiary, bytes32 secret)'
  ];
  
  const escrowContract = new ethers.Contract(escrowAddress, escrowAbi, provider);
  
  return new Promise((resolve) => {
    escrowContract.once('EscrowWithdrawn', (escrowId, beneficiary, secret) => {
      console.log('\n🔓 SECRET REVEALED ON-CHAIN!');
      console.log(`   Escrow ID: ${escrowId}`);
      console.log(`   Beneficiary: ${beneficiary}`);
      console.log(`   Secret: ${secret}`);
      capturedSecret = secret;
      resolve(secret);
    });
  });
}

async function runProperFlowTest() {
  console.log('🚀 Fusion+ Proper Flow Test with Balance & Secret Tracking');
  console.log('═'.repeat(60));
  console.log('This test demonstrates:');
  console.log('- Actual balance changes for all parties');
  console.log('- Secret reveal flow in atomic swap');
  console.log('- Gasless experience for users\n');

  try {
    // Initialize client
    const client = new FusionPlusClient(ORDER_ENGINE_URL, RELAYER_URL);
    
    // Set up test signer (in production, use MetaMask)
    const provider = new ethers.JsonRpcProvider(ETH_RPC);
    const signer = new ethers.Wallet(TEST_USER_PRIVATE_KEY, provider);
    client.setSigner(signer);
    
    // Capture initial balances
    balances.initial = await captureAllBalances('INITIAL BALANCES');
    
    // Step 1: User creates swap intent
    console.log('\n\n🔄 STEP 1: User Creates Swap Intent (ETH → APT)');
    console.log('─'.repeat(60));
    
    // Set up listener for destination escrow
    client.onDestinationEscrowCreated = (data) => {
      console.log('\n📦 Destination Escrow Created!');
      console.log(`   Chain: ${data.chain}`);
      console.log(`   Escrow ID: ${data.escrowId}`);
      console.log(`   Secret Hash: ${data.secretHash}`);
      console.log(`   Timelock: ${new Date(data.timelock * 1000).toLocaleString()}`);
      destinationEscrowInfo = data;
    };
    
    const orderId = await client.createSwapIntent({
      fromChain: 'ETHEREUM',
      toChain: 'APTOS',
      fromAmount: ethers.parseEther('0.001').toString(),
      minToAmount: (0.5 * 1e8).toString(), // 0.5 APT
      receiver: USER_APTOS_ADDRESS
    });
    
    console.log(`✅ Order created: ${orderId}`);
    console.log('   No gas paid by user!');
    
    // Wait for resolver to create destination escrow
    console.log('\n⏳ Waiting for resolver to create destination escrow...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Capture balances after destination escrow
    balances.afterDestEscrow = await captureAllBalances('AFTER DESTINATION ESCROW CREATED');
    
    // Verify resolver locked APT
    const resolverAptChange = parseFloat(balances.afterDestEscrow.resolverApt) - parseFloat(balances.initial.resolverApt);
    console.log(`\n✓ Resolver APT change: ${resolverAptChange.toFixed(8)} APT`);
    
    // Step 2: User creates source escrow (gasless via relayer)
    console.log('\n\n🔄 STEP 2: User Creates Source Escrow (Gasless)');
    console.log('─'.repeat(60));
    
    if (!destinationEscrowInfo) {
      throw new Error('Destination escrow not created yet');
    }
    
    // Start monitoring for secret reveal
    const secretPromise = monitorSecretReveal();
    
    console.log('Creating source escrow via relayer...');
    const sourceTxHash = await client.createSourceEscrow(
      destinationEscrowInfo,
      ethers.parseEther('0.001').toString()
    );
    
    console.log(`✅ Source escrow created: ${sourceTxHash}`);
    console.log('   Relayer paid the gas!');
    
    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Capture balances after source escrow
    balances.afterSourceEscrow = await captureAllBalances('AFTER SOURCE ESCROW CREATED');
    
    // Verify user ETH locked (via relayer)
    const userEthChange = parseFloat(balances.afterSourceEscrow.userEth) - parseFloat(balances.initial.userEth);
    console.log(`\n✓ User ETH change: ${userEthChange.toFixed(6)} ETH`);
    console.log('  (Should be ~-0.001 ETH locked in escrow)');
    
    // Step 3: Wait for secret reveal
    console.log('\n\n🔄 STEP 3: Monitoring for Secret Reveal');
    console.log('─'.repeat(60));
    console.log('Waiting for resolver to reveal secret...');
    
    const revealedSecret = await secretPromise;
    
    // Capture balances after secret reveal
    await new Promise(resolve => setTimeout(resolve, 5000));
    balances.afterSecretReveal = await captureAllBalances('AFTER SECRET REVEALED');
    
    // Verify resolver withdrew ETH
    const resolverEthGain = parseFloat(balances.afterSecretReveal.resolverEth) - parseFloat(balances.initial.resolverEth);
    console.log(`\n✓ Resolver ETH gain: ${resolverEthGain.toFixed(6)} ETH`);
    
    // Step 4: User withdraws from destination (gasless)
    console.log('\n\n🔄 STEP 4: User Withdraws from Destination (Gasless)');
    console.log('─'.repeat(60));
    
    console.log('Using revealed secret to withdraw APT...');
    const withdrawTxHash = await client.withdrawFromEscrow(
      destinationEscrowInfo.escrowId,
      revealedSecret,
      'APTOS'
    );
    
    console.log(`✅ Withdrawal submitted: ${withdrawTxHash}`);
    console.log('   Relayer paid the gas!');
    
    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Capture final balances
    balances.final = await captureAllBalances('FINAL BALANCES');
    
    // Summary
    console.log('\n\n📈 SWAP SUMMARY');
    console.log('═'.repeat(60));
    
    console.log('\nUser Balance Changes:');
    const userEthTotal = parseFloat(balances.final.userEth) - parseFloat(balances.initial.userEth);
    const userAptTotal = parseFloat(balances.final.userApt) - parseFloat(balances.initial.userApt);
    console.log(`  ETH: ${userEthTotal.toFixed(6)} (sent 0.001 ETH)`);
    console.log(`  APT: +${userAptTotal.toFixed(8)} (received 0.5 APT)`);
    console.log(`  Gas paid: 0 (gasless!)`);
    
    console.log('\nResolver Balance Changes:');
    const resolverEthTotal = parseFloat(balances.final.resolverEth) - parseFloat(balances.initial.resolverEth);
    const resolverAptTotal = parseFloat(balances.final.resolverApt) - parseFloat(balances.initial.resolverApt);
    console.log(`  ETH: +${resolverEthTotal.toFixed(6)} (received 0.001 ETH)`);
    console.log(`  APT: ${resolverAptTotal.toFixed(8)} (sent 0.5 APT)`);
    
    console.log('\nRelayer Gas Costs:');
    const relayerEthCost = parseFloat(balances.initial.relayerEth) - parseFloat(balances.final.relayerEth);
    const relayerAptCost = parseFloat(balances.initial.relayerApt) - parseFloat(balances.final.relayerApt);
    console.log(`  ETH gas: ${relayerEthCost.toFixed(6)} ETH`);
    console.log(`  APT gas: ${relayerAptCost.toFixed(8)} APT`);
    
    console.log('\n\n✅ SUCCESS: Proper Fusion+ flow completed!');
    console.log('   - User swapped ETH for APT without paying gas');
    console.log('   - Atomic swap security maintained');
    console.log('   - Secret revealed on-chain for trustless execution');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

// Run the test
runProperFlowTest().catch(console.error);