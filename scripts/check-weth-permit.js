#!/usr/bin/env node

const { ethers } = require('ethers');

async function checkWETHPermit() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  
  console.log('\n🔍 Checking WETH permit support on Sepolia...\n');
  
  // EIP-2612 permit interface
  const permitABI = [
    'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
    'function nonces(address owner) view returns (uint256)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function name() view returns (string)',
    'function version() view returns (string)'
  ];
  
  const wethContract = new ethers.Contract(WETH_ADDRESS, permitABI, provider);
  
  // Check if permit function exists
  try {
    // Try to get DOMAIN_SEPARATOR - a key component of EIP-2612
    const domainSeparator = await wethContract.DOMAIN_SEPARATOR();
    console.log('✅ DOMAIN_SEPARATOR found:', domainSeparator);
    
    // Try to get nonces function
    const testAddress = '0x0000000000000000000000000000000000000001';
    const nonce = await wethContract.nonces(testAddress);
    console.log('✅ Nonces function works, test nonce:', nonce.toString());
    
    // Check name
    const name = await wethContract.name();
    console.log('✅ Token name:', name);
    
    console.log('\n🎉 WETH on Sepolia supports EIP-2612 permit!');
    
  } catch (error) {
    console.log('❌ WETH does not support permit:', error.message);
    
    // Check what functions ARE available
    console.log('\n📋 Checking standard WETH functions...');
    
    const standardABI = [
      'function deposit() payable',
      'function withdraw(uint256)',
      'function approve(address, uint256) returns (bool)',
      'function transfer(address, uint256) returns (bool)',
      'function transferFrom(address, address, uint256) returns (bool)',
      'function balanceOf(address) view returns (uint256)',
      'function allowance(address, address) view returns (uint256)'
    ];
    
    const standardContract = new ethers.Contract(WETH_ADDRESS, standardABI, provider);
    
    try {
      const testAddr = '0x0000000000000000000000000000000000000001';
      const balance = await standardContract.balanceOf(testAddr);
      console.log('✅ Standard WETH functions work');
      console.log('   balanceOf test address:', ethers.formatEther(balance));
    } catch (e) {
      console.log('❌ Error checking standard functions:', e.message);
    }
  }
}

checkWETHPermit().catch(console.error);