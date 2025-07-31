const { ethers } = require('ethers');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function checkETHBalance() {
  const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');
  
  const resolverAddress = process.env.ETHEREUM_RESOLVER_ADDRESS || '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
  
  console.log('Checking ETH balance for resolver...');
  console.log('Resolver address:', resolverAddress);
  
  try {
    const balance = await provider.getBalance(resolverAddress);
    console.log('ETH Balance:', ethers.formatEther(balance), 'ETH');
    console.log('ETH Balance (wei):', balance.toString());
    
    // Check if balance is sufficient for gas
    const minGasRequired = ethers.parseEther('0.01'); // 0.01 ETH for gas
    console.log('Has enough for gas?', balance >= minGasRequired);
    
    if (balance < minGasRequired) {
      console.log('⚠️  Resolver needs more ETH for gas!');
      console.log('   Please send at least 0.01 ETH to:', resolverAddress);
    }
  } catch (error) {
    console.error('Failed to check balance:', error.message);
  }
}

checkETHBalance().catch(console.error);