const { ethers } = require('ethers');

async function checkAllAddresses() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  const addresses = {
    'User (test key 1)': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    'Resolver (configured)': '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
    'Escrow Contract': '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4'
  };
  
  console.log('📊 Checking all test addresses on Sepolia:\n');
  
  for (const [name, address] of Object.entries(addresses)) {
    const balance = await provider.getBalance(address);
    console.log(`${name.padEnd(25)} ${address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
    
    if (name.includes('User') && balance < ethers.parseEther('0.002')) {
      console.log('❌ NEEDS FUNDING (at least 0.002 ETH)\n');
    } else if (name.includes('Resolver') && balance < ethers.parseEther('0.002')) {
      console.log('⚠️  Low balance - may need funding for Aptos escrow creation\n');
    } else {
      console.log('✅ Sufficient balance\n');
    }
  }
  
  console.log('For the test to work:');
  console.log('- User needs 0.002+ ETH to create source escrow');
  console.log('- Resolver needs 0.002+ ETH for gas fees');
}

checkAllAddresses().catch(console.error);