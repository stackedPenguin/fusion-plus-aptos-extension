const { ethers } = require('ethers');

async function checkBalance() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const address = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
  
  console.log('Checking balance for:', address);
  const balance = await provider.getBalance(address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  
  if (balance === 0n) {
    console.log('\nWallet needs funding!');
    console.log('Visit: https://sepoliafaucet.com/');
    console.log('Or: https://faucets.chain.link/sepolia');
  }
}

checkBalance().catch(console.error);