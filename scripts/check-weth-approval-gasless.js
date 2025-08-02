#!/usr/bin/env node

const { ethers } = require('ethers');

async function checkApproval() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  
  const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const GASLESS_ESCROW = '0x4868C055E894f6C774960a175aD11Dec26f8475f';
  const USER = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
  
  const wethAbi = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)'
  ];
  
  const weth = new ethers.Contract(WETH, wethAbi, provider);
  
  console.log('\n🔍 Checking WETH approval for gasless escrow...\n');
  
  try {
    // Check allowance
    const allowance = await weth.allowance(USER, GASLESS_ESCROW);
    console.log('User:', USER);
    console.log('Gasless Escrow:', GASLESS_ESCROW);
    console.log('Allowance:', ethers.formatEther(allowance), 'WETH');
    
    if (allowance === 0n) {
      console.log('\n❌ USER HAS NOT APPROVED WETH TO GASLESS ESCROW!');
      console.log('This is why the transaction is reverting.');
      console.log('\nSolution: User needs to approve WETH to the gasless escrow contract first.');
    } else {
      console.log('\n✅ User has approved WETH to gasless escrow');
    }
    
    // Also check balance
    const balance = await weth.balanceOf(USER);
    console.log('\nUser WETH balance:', ethers.formatEther(balance), 'WETH');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkApproval().catch(console.error);