const { ethers } = require('ethers');
require('dotenv').config();

const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');

const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const WETH_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const ESCROW_ADDRESS = '0x5Ea57C2Fb5f054E9bdBdb3449135f823439E1338';

async function checkBalances() {
  console.log('\n=== WETH Balance Check ===\n');
  
  const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, provider);
  
  // Check user wallet
  const userAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
  const userBalance = await wethContract.balanceOf(userAddress);
  const userAllowance = await wethContract.allowance(userAddress, ESCROW_ADDRESS);
  
  console.log(`User Wallet: ${userAddress}`);
  console.log(`  WETH Balance: ${ethers.formatEther(userBalance)} WETH`);
  console.log(`  WETH Raw Balance: ${userBalance.toString()}`);
  console.log(`  Escrow Allowance: ${ethers.formatEther(userAllowance)} WETH`);
  
  // Check resolver wallet
  const resolverAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
  const resolverBalance = await wethContract.balanceOf(resolverAddress);
  
  console.log(`\nResolver Wallet: ${resolverAddress}`);
  console.log(`  WETH Balance: ${ethers.formatEther(resolverBalance)} WETH`);
  console.log(`  WETH Raw Balance: ${resolverBalance.toString()}`);
  
  // Check ETH balances too
  const userEthBalance = await provider.getBalance(userAddress);
  const resolverEthBalance = await provider.getBalance(resolverAddress);
  
  console.log(`\n=== ETH Balances ===`);
  console.log(`User ETH: ${ethers.formatEther(userEthBalance)} ETH`);
  console.log(`Resolver ETH: ${ethers.formatEther(resolverEthBalance)} ETH`);
  
  // Check current block
  const blockNumber = await provider.getBlockNumber();
  console.log(`\nCurrent Block: ${blockNumber}`);
}

checkBalances().catch(console.error);