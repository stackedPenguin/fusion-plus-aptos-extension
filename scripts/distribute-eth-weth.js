const { ethers } = require('ethers');
// Provider
const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

// Resolver 1 wallet (has funds)
const resolver1PrivateKey = '0xc8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74';
const resolver1Wallet = new ethers.Wallet(resolver1PrivateKey, provider);

// WETH contract
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const WETH_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function withdraw(uint256 amount)'
];

// Resolver addresses
const resolvers = [
  { 
    name: 'Resolver-2', 
    address: '0xE4ffA965DF0e576cC8838F79A8e8BFEC6E8b6F3f',
    ethAmount: '0.015', // ETH to send
    wethAmount: '0.15'  // WETH to send
  },
  { 
    name: 'Resolver-3', 
    address: '0xe3b57C5f8cd68EaD1AE7B5d8B947D006ADb37c66',
    ethAmount: '0.015', // ETH to send
    wethAmount: '0.15'  // WETH to send
  }
];

async function distributeAssets() {
  console.log('Distributing ETH and WETH from Resolver-1 to other resolvers...\n');
  
  // Check Resolver-1 balances
  const ethBalance = await provider.getBalance(resolver1Wallet.address);
  const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, resolver1Wallet);
  const wethBalance = await wethContract.balanceOf(resolver1Wallet.address);
  
  console.log('Resolver-1 current balances:');
  console.log(`  ETH: ${ethers.formatEther(ethBalance)}`);
  console.log(`  WETH: ${ethers.formatEther(wethBalance)}\n`);
  
  // Calculate total needed
  const totalEthNeeded = resolvers.reduce((sum, r) => sum + parseFloat(r.ethAmount), 0);
  const totalWethNeeded = resolvers.reduce((sum, r) => sum + parseFloat(r.wethAmount), 0);
  
  console.log('Total needed for distribution:');
  console.log(`  ETH: ${totalEthNeeded}`);
  console.log(`  WETH: ${totalWethNeeded}\n`);
  
  // Check if we need to unwrap WETH to get ETH
  const ethNeeded = ethers.parseEther(totalEthNeeded.toString());
  const currentEth = ethBalance;
  
  if (currentEth < ethNeeded + ethers.parseEther('0.001')) { // Keep 0.001 ETH for gas
    console.log('Insufficient ETH, unwrapping some WETH...');
    const amountToUnwrap = ethNeeded - currentEth + ethers.parseEther('0.005'); // Extra for gas
    
    if (wethBalance < amountToUnwrap) {
      console.error('❌ Insufficient WETH to unwrap for ETH needs');
      return;
    }
    
    try {
      const unwrapTx = await wethContract.withdraw(amountToUnwrap);
      console.log(`  Unwrapping ${ethers.formatEther(amountToUnwrap)} WETH...`);
      console.log(`  Tx hash: ${unwrapTx.hash}`);
      await unwrapTx.wait();
      console.log('  ✅ WETH unwrapped successfully\n');
    } catch (error) {
      console.error('❌ Failed to unwrap WETH:', error.message);
      return;
    }
  }
  
  // Distribute to each resolver
  for (const resolver of resolvers) {
    console.log(`\nDistributing to ${resolver.name}:`);
    console.log(`  Address: ${resolver.address}`);
    
    try {
      // Send ETH
      console.log(`  Sending ${resolver.ethAmount} ETH...`);
      const ethTx = await resolver1Wallet.sendTransaction({
        to: resolver.address,
        value: ethers.parseEther(resolver.ethAmount)
      });
      console.log(`    Tx hash: ${ethTx.hash}`);
      await ethTx.wait();
      console.log('    ✅ ETH sent');
      
      // Send WETH
      console.log(`  Sending ${resolver.wethAmount} WETH...`);
      const wethTx = await wethContract.transfer(
        resolver.address, 
        ethers.parseEther(resolver.wethAmount)
      );
      console.log(`    Tx hash: ${wethTx.hash}`);
      await wethTx.wait();
      console.log('    ✅ WETH sent');
      
    } catch (error) {
      console.error(`❌ Failed to distribute to ${resolver.name}:`, error.message);
    }
  }
  
  // Check final balances
  console.log('\nFinal Resolver-1 balances:');
  const finalEthBalance = await provider.getBalance(resolver1Wallet.address);
  const finalWethBalance = await wethContract.balanceOf(resolver1Wallet.address);
  console.log(`  ETH: ${ethers.formatEther(finalEthBalance)}`);
  console.log(`  WETH: ${ethers.formatEther(finalWethBalance)}`);
  
  console.log('\n✅ Distribution complete!');
}

distributeAssets().catch(console.error);