const { ethers } = require('ethers');
require('dotenv').config();

// This script helps test USDC swaps by:
// 1. Getting some USDC from a faucet or swap
// 2. Funding the resolver with USDC for testing

const USDC_ADDRESS = '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8'; // Sepolia USDC
const RESOLVER_ADDRESS = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';

async function main() {
  console.log('=== USDC Swap Testing Guide ===\n');
  
  console.log('Since you don\'t have USDC, here are your options:\n');
  
  console.log('Option 1: Use Aave Sepolia Faucet');
  console.log('1. Go to: https://app.aave.com/faucet/');
  console.log('2. Connect your wallet to Sepolia network');
  console.log('3. Request USDC from the faucet');
  console.log('4. Wait for the transaction to complete\n');
  
  console.log('Option 2: Use Uniswap on Sepolia');
  console.log('1. Go to: https://app.uniswap.org/');
  console.log('2. Connect to Sepolia testnet');
  console.log('3. Swap some ETH for USDC');
  console.log('4. Use the USDC address:', USDC_ADDRESS, '\n');
  
  console.log('Option 3: Manual Testing');
  console.log('For hackathon demo, you can:');
  console.log('1. Show the USDC integration in the UI');
  console.log('2. Demonstrate the multi-token support');
  console.log('3. Explain how any ERC20 can be integrated\n');
  
  console.log('Resolver USDC Setup:');
  console.log('The resolver also needs USDC to facilitate swaps.');
  console.log('Resolver address:', RESOLVER_ADDRESS);
  console.log('Send some test USDC to the resolver for demo purposes.\n');
}

main().catch(console.error);