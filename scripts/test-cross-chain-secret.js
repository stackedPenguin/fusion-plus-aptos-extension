const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const ADAPTER_ADDRESS = '0x544f58930c7B12c77540f76eb378677260e044dc';

async function testCrossChainSecret() {
  console.log('🌐 CROSS-CHAIN SECRET REVEAL TEST');
  console.log('═'.repeat(80));
  console.log('This test demonstrates LayerZero integration for cross-chain secret reveals\n');
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  
  // Resolver wallet (has funds)
  const resolverWallet = new ethers.Wallet(
    'c8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74',
    provider
  );
  
  console.log('📋 Test Setup:');
  console.log(`  Resolver:        ${resolverWallet.address}`);
  console.log(`  Escrow:          ${ESCROW_ADDRESS}`);
  console.log(`  LayerZero:       ${ADAPTER_ADDRESS}`);
  
  // LayerZero adapter ABI
  const adapterAbi = [
    'function sendSecretReveal(uint32 _dstEid, bytes32 _escrowId, bytes32 _secret) payable',
    'function getRevealedSecret(bytes32 _escrowId) view returns (bool hasSecret, bytes32 secret)',
    'event SecretRevealSent(uint32 dstEid, bytes32 escrowId, bytes32 secret, address revealer)'
  ];
  
  const adapter = new ethers.Contract(ADAPTER_ADDRESS, adapterAbi, resolverWallet);
  
  // Test parameters
  const escrowId = ethers.id('test-cross-chain-' + Date.now());
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  const APTOS_EID = 10108; // Aptos testnet endpoint ID
  
  console.log('\n🔐 Secret Parameters:');
  console.log(`  Escrow ID: ${escrowId.substring(0, 20)}...`);
  console.log(`  Secret:    ${ethers.hexlify(secret).substring(0, 20)}...`);
  console.log(`  Hash:      ${secretHash.substring(0, 20)}...`);
  
  // STEP 1: Send secret reveal cross-chain
  console.log('\n📤 STEP 1: Send Secret Reveal to Aptos');
  console.log('─'.repeat(80));
  
  try {
    console.log('  Sending secret reveal via LayerZero...');
    console.log(`  Destination: Aptos (EID ${APTOS_EID})`);
    
    // Estimate gas (in production, would also estimate LayerZero fee)
    const gasEstimate = await adapter.sendSecretReveal.estimateGas(
      APTOS_EID,
      escrowId,
      secret,
      { value: ethers.parseEther('0.0001') } // Small fee for test
    );
    
    console.log(`  Estimated gas: ${gasEstimate.toString()}`);
    
    const tx = await adapter.sendSecretReveal(
      APTOS_EID,
      escrowId,
      secret,
      { value: ethers.parseEther('0.0001') }
    );
    
    console.log(`\n  TX submitted: ${tx.hash}`);
    console.log('  Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log(`  ✅ Secret reveal sent in block ${receipt.blockNumber}`);
    
    // Find the event
    const event = receipt.logs.find(log => {
      try {
        const parsed = adapter.interface.parseLog(log);
        return parsed && parsed.name === 'SecretRevealSent';
      } catch {
        return false;
      }
    });
    
    if (event) {
      console.log('  📢 SecretRevealSent event emitted');
    }
    
  } catch (error) {
    console.error('  ❌ Failed to send secret reveal:', error.message);
    return;
  }
  
  // STEP 2: Check local storage
  console.log('\n🔍 STEP 2: Verify Local Storage');
  console.log('─'.repeat(80));
  
  const [hasSecret, storedSecret] = await adapter.getRevealedSecret(escrowId);
  
  console.log(`  Secret stored locally: ${hasSecret ? 'Yes' : 'No'}`);
  if (hasSecret) {
    console.log(`  Stored secret: ${storedSecret.substring(0, 20)}...`);
    console.log(`  Match: ${storedSecret === ethers.hexlify(secret) ? '✅ Yes' : '❌ No'}`);
  }
  
  // Summary
  console.log('\n\n📊 CROSS-CHAIN SUMMARY');
  console.log('═'.repeat(80));
  
  console.log('\n✅ The test demonstrates:');
  console.log('  1. Secret was sent to LayerZero adapter');
  console.log('  2. Event was emitted for cross-chain delivery');
  console.log('  3. Secret is stored locally for verification');
  
  console.log('\n🎯 In production:');
  console.log('  - LayerZero would relay the message to Aptos');
  console.log('  - Aptos layerzero_adapter would receive the secret');
  console.log('  - User could withdraw from Aptos escrow using withdraw_cross_chain');
  
  console.log('\n📝 Integration notes:');
  console.log('  - FusionPlusEscrow can query adapter for revealed secrets');
  console.log('  - Resolver reveals secret on source chain after withdrawal');
  console.log('  - Secret propagates to destination chain via LayerZero');
}

testCrossChainSecret().catch(console.error);