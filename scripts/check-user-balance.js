const { ethers } = require('ethers');

async function checkBalance() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const userAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  
  console.log(`Checking balance for: ${userAddress}`);
  
  const balance = await provider.getBalance(userAddress);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  
  const blockNumber = await provider.getBlockNumber();
  console.log(`Current block: ${blockNumber}`);
}

checkBalance().catch(console.error);