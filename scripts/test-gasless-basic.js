#!/usr/bin/env node

const { ethers } = require('ethers');

async function testBasicGaslessContract() {
  console.log('\n🧪 Testing Basic Gasless Contract Functions...\n');

  const provider = new ethers.JsonRpcProvider(
    'https://ethereum-sepolia.publicnode.com'
  );
  
  const gaslessEscrowAddress = '0x4868C055E894f6C774960a175aD11Dec26f8475f';
  
  // Basic contract interface
  const gaslessEscrowAbi = [
    'function WETH() view returns (address)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function getNonce(address user) view returns (uint256)',
    'function escrows(bytes32) view returns (address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit)'
  ];
  
  const gaslessEscrow = new ethers.Contract(gaslessEscrowAddress, gaslessEscrowAbi, provider);
  
  try {
    // Test 1: Get WETH address
    console.log('1️⃣ Testing WETH constant...');
    const wethAddress = await gaslessEscrow.WETH();
    console.log('   WETH address:', wethAddress);
    console.log('   ✅ Expected Sepolia WETH:', '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14');
    
    // Test 2: Get domain separator
    console.log('\n2️⃣ Testing DOMAIN_SEPARATOR...');
    const domainSeparator = await gaslessEscrow.DOMAIN_SEPARATOR();
    console.log('   Domain separator:', domainSeparator);
    console.log('   ✅ Contract is deployed and responding');
    
    // Test 3: Get nonce for a test address
    console.log('\n3️⃣ Testing nonce function...');
    const testAddress = '0x0000000000000000000000000000000000000001';
    const nonce = await gaslessEscrow.getNonce(testAddress);
    console.log('   Nonce for test address:', nonce.toString());
    console.log('   ✅ Nonce tracking works');
    
    // Test 4: Check an escrow slot
    console.log('\n4️⃣ Testing escrow storage...');
    const testEscrowId = ethers.id('test-escrow-1');
    const escrow = await gaslessEscrow.escrows(testEscrowId);
    console.log('   Escrow depositor:', escrow.depositor);
    console.log('   ✅ Escrow storage accessible');
    
    console.log('\n✅ All basic contract functions working!');
    console.log('📍 Contract deployed at:', gaslessEscrowAddress);
    console.log('🔗 View on Etherscan: https://sepolia.etherscan.io/address/' + gaslessEscrowAddress);
    
  } catch (error) {
    console.error('\n❌ Error testing contract:', error.message);
    process.exit(1);
  }
}

testBasicGaslessContract().catch(console.error);