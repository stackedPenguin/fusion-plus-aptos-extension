const { ethers } = require('ethers');

async function checkAllBalances() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  // All the wallets we've been using
  const wallets = [
    { name: 'Test Key 1', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
    { name: 'Test Key 2', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
    { name: 'Test Key 3', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
    { name: 'User Wallet', address: '0xb6d228940a730fb3c37b438cdb6e7344dfb3a2f8' },
    { name: 'Relayer Wallet', address: '0x81c480e821c5264dd00ce36285a5285875416656' },
    { name: 'Resolver Wallet', address: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc' },
    { name: 'Escrow Contract', address: '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4' }
  ];
  
  console.log('Checking all wallet balances on Sepolia:\n');
  
  for (const wallet of wallets) {
    const balance = await provider.getBalance(wallet.address);
    const name = wallet.name + ' '.repeat(20 - wallet.name.length);
    console.log(name + ' ' + wallet.address + ' = ' + ethers.formatEther(balance) + ' ETH');
  }
}

checkAllBalances().catch(console.error);