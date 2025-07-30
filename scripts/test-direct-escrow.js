const { ethers } = require('ethers');
const axios = require('axios');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const ORDER_ENGINE_URL = 'http://localhost:3001';

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testDirectEscrow() {
  console.log('🚀 FUSION+ DIRECT ESCROW TEST');
  console.log('═'.repeat(80));
  console.log('This test demonstrates direct escrow creation with balance transfers\n');
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  
  // Test wallets
  const userWallet = new ethers.Wallet(
    '0x9aa575bac62c0966d497971a4504d8a5b68b198608120553d38da3bba8436efe', // new user wallet
    provider
  );
  
  const resolverWallet = new ethers.Wallet(
    'c8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74', // resolver wallet
    provider
  );
  
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
  
  // Generate escrow parameters
  const escrowId = ethers.id('direct-test-' + Date.now());
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  const amount = ethers.parseEther('0.001');
  const safetyDeposit = ethers.parseEther('0.0001');
  const timelock = Math.floor(Date.now() / 1000) + 3600;
  
  console.log('\n🔐 Escrow Parameters:');
  console.log(`  Escrow ID: ${escrowId.substring(0, 20)}...`);
  console.log(`  Amount: ${ethers.formatEther(amount)} ETH`);
  console.log(`  Secret Hash: ${secretHash.substring(0, 20)}...`);
  
  // STEP 1: User creates source escrow
  console.log('\n💸 STEP 1: User Creates Source Escrow');
  console.log('─'.repeat(80));
  
  const escrowAbi = [
    'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
    'function withdraw(bytes32 _escrowId, bytes32 _secret)',
    'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)',
    'event Withdrawn(bytes32 indexed escrowId, bytes32 secret)'
  ];
  
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, userWallet);
  const totalValue = amount + safetyDeposit;
  
  console.log('  Creating escrow with:');
  console.log(`    Beneficiary: ${resolverWallet.address}`);
  console.log(`    Amount: ${ethers.formatEther(amount)} ETH`);
  console.log(`    Safety: ${ethers.formatEther(safetyDeposit)} ETH`);
  console.log(`    Total: ${ethers.formatEther(totalValue)} ETH`);
  
  try {
    const tx = await escrowContract.createEscrow(
      escrowId,
      resolverWallet.address,
      ethers.ZeroAddress,
      amount,
      secretHash,
      timelock,
      { value: totalValue }
    );
    
    console.log(`\n  TX submitted: ${tx.hash}`);
    console.log('  Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log(`  ✅ Escrow created in block ${receipt.blockNumber}`);
    
    // Find the event
    const event = receipt.logs.find(log => {
      try {
        const parsed = escrowContract.interface.parseLog(log);
        return parsed && parsed.name === 'EscrowCreated';
      } catch {
        return false;
      }
    });
    
    if (event) {
      console.log('  📢 Event emitted successfully');
    }
    
  } catch (error) {
    console.error('  ❌ Failed to create escrow:', error.message);
    return;
  }
  
  // Check balances after escrow
  console.log('\n💰 Balances After Escrow Creation:');
  const userBalance2 = await provider.getBalance(userWallet.address);
  const escrowBalance2 = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log(`  User:     ${ethers.formatEther(userBalance2)} ETH (was ${ethers.formatEther(userBalance)})`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalance2)} ETH (was ${ethers.formatEther(escrowBalance)})`);
  console.log(`  Locked:   ${ethers.formatEther(totalValue)} ETH`);
  
  // STEP 2: Resolver withdraws using secret
  console.log('\n\n🔓 STEP 2: Resolver Withdraws Using Secret');
  console.log('─'.repeat(80));
  
  const resolverContract = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, resolverWallet);
  
  console.log('  Revealing secret and withdrawing...');
  console.log(`  Secret: ${ethers.hexlify(secret).substring(0, 20)}...`);
  
  try {
    const withdrawTx = await resolverContract.withdraw(escrowId, secret);
    console.log(`\n  TX submitted: ${withdrawTx.hash}`);
    console.log('  Waiting for confirmation...');
    
    const withdrawReceipt = await withdrawTx.wait();
    console.log(`  ✅ Withdrawn in block ${withdrawReceipt.blockNumber}`);
    
    // Find the withdraw event
    const withdrawEvent = withdrawReceipt.logs.find(log => {
      try {
        const parsed = resolverContract.interface.parseLog(log);
        return parsed && parsed.name === 'Withdrawn';
      } catch {
        return false;
      }
    });
    
    if (withdrawEvent) {
      console.log('  📢 Secret revealed on-chain!');
    }
    
  } catch (error) {
    console.error('  ❌ Failed to withdraw:', error.message);
    return;
  }
  
  // Final balances
  console.log('\n💰 Final Balances:');
  const userBalance3 = await provider.getBalance(userWallet.address);
  const resolverBalance3 = await provider.getBalance(resolverWallet.address);
  const escrowBalance3 = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log(`  User:     ${ethers.formatEther(userBalance3)} ETH`);
  console.log(`  Resolver: ${ethers.formatEther(resolverBalance3)} ETH`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalance3)} ETH`);
  
  // Calculate actual transfers
  const userSpent = userBalance - userBalance3;
  const resolverGained = resolverBalance3 - resolverBalance;
  const gasUsed = userSpent - totalValue + (resolverBalance - resolverBalance3 + amount);
  
  console.log('\n\n📊 TRANSACTION SUMMARY');
  console.log('═'.repeat(80));
  
  console.log('\n💸 Actual Value Transfer:');
  console.log(`  User spent:      ${ethers.formatEther(userSpent)} ETH (including gas)`);
  console.log(`  Resolver gained: ${ethers.formatEther(resolverGained)} ETH (after gas)`);
  console.log(`  Value moved:     ${ethers.formatEther(amount)} ETH`);
  console.log(`  Total gas cost:  ~${ethers.formatEther(gasUsed)} ETH`);
  
  console.log('\n✅ SUCCESS! The test demonstrates:');
  console.log('  1. User locked 0.001 ETH in escrow');
  console.log('  2. Resolver withdrew using secret');
  console.log('  3. Secret is now revealed on-chain');
  console.log('  4. Actual ETH was transferred between wallets');
  
  console.log('\n🎯 In the full Fusion+ flow:');
  console.log('  - This would be the source escrow on Ethereum');
  console.log('  - Resolver would have already created destination escrow on Aptos');
  console.log('  - User could now use the revealed secret to claim APT on Aptos');
}

testDirectEscrow().catch(console.error);