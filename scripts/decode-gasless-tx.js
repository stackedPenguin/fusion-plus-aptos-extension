#!/usr/bin/env node

const { ethers } = require('ethers');

const txData = '0x6bedaf23f481bdf45c22524036bded6ce1b655b4376c82e6c53d03f54d35a964ae30da2700000000000000000000000017061146a55f31bb85c7e211143581b44f2a03d00000000000000000000000004718eafbbdc0ddaafeb520ff641c6aecba8042fc000000000000000000000000fff9976782d46cc05630d1f6ebab18b2324d6b140000000000000000000000000000000000000000000000000001c6bf52634000a8e3525d10a96e6cd98b78675c6785624f670093789962c91ab6bccd47b3d29f00000000000000000000000000000000000000000000000000000000688e303500000000000000000000000000000000000000000000000000000000688e373d000000000000000000000000000000000000000000000000000000000000001c4aa3503a087b9fc911da038000ea32ab50cc2d759b2064913f96353bccb571b8288360fbf9585b096f1ac6fad4c14141ee692994f30af02828c7e96c3059c166';

// ABI for createEscrowWithMetaTx
const abi = [
  'function createEscrowWithMetaTx(tuple(bytes32 escrowId, address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, uint256 deadline) params, uint8 v, bytes32 r, bytes32 s) external payable'
];

const iface = new ethers.Interface(abi);

try {
  const decoded = iface.parseTransaction({ data: txData });
  console.log('\n📋 Decoded Transaction:');
  console.log('Function:', decoded.name);
  console.log('\nParameters:');
  
  const params = decoded.args[0];
  console.log('  escrowId:', params.escrowId);
  console.log('  depositor:', params.depositor);
  console.log('  beneficiary:', params.beneficiary);
  console.log('  token:', params.token);
  console.log('  amount:', ethers.formatEther(params.amount), 'WETH');
  console.log('  hashlock:', params.hashlock);
  console.log('  timelock:', new Date(Number(params.timelock) * 1000).toLocaleString());
  console.log('  deadline:', new Date(Number(params.deadline) * 1000).toLocaleString());
  
  console.log('\nSignature:');
  console.log('  v:', decoded.args[1]);
  console.log('  r:', decoded.args[2]);
  console.log('  s:', decoded.args[3]);
  
  // Check if escrow already exists
  console.log('\n🔍 Potential issues:');
  console.log('1. Check if user has approved WETH to gasless escrow');
  console.log('2. Verify signature matches the parameters');
  console.log('3. Check if escrow ID already exists');
  console.log('4. Ensure deadline has not passed');
  
  const now = Math.floor(Date.now() / 1000);
  if (Number(params.deadline) < now) {
    console.log('\n❌ DEADLINE HAS PASSED!');
  }
  
} catch (error) {
  console.error('Failed to decode:', error);
}