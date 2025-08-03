const { ethers } = require('ethers');
require('dotenv').config({ path: 'backend/resolver/.env' });

const WETH_ABI = [
  'function deposit() payable',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

async function fundResolvers() {
  try {
    // Setup provider and wallet for Resolver 1
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const resolver1Wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, provider);
    
    console.log('💰 Funding resolvers from Resolver 1');
    console.log(`Resolver 1 address: ${resolver1Wallet.address}`);
    
    // Check Resolver 1 balances
    const ethBalance = await provider.getBalance(resolver1Wallet.address);
    console.log(`Resolver 1 ETH balance: ${ethers.formatEther(ethBalance)} ETH`);
    
    // WETH contract
    const wethAddress = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    const wethContract = new ethers.Contract(wethAddress, WETH_ABI, resolver1Wallet);
    
    const wethBalance = await wethContract.balanceOf(resolver1Wallet.address);
    console.log(`Resolver 1 WETH balance: ${ethers.formatEther(wethBalance)} WETH`);
    
    // Resolver addresses to fund
    const resolvers = [
      {
        name: 'Resolver 2',
        address: '0x3059921A0E8362110e8141f7c1d25eeC3762294b'
      },
      {
        name: 'Resolver 3', 
        address: '0xF288aaC4D29092Fd7eC652357D46900a4F05425B'
      }
    ];
    
    // Amount to send to each resolver
    const ethAmount = ethers.parseEther('0.01'); // 0.01 ETH for gas
    const wethAmount = ethers.parseEther('0.002'); // 0.002 WETH for testing (20 tests of 0.0001)
    
    console.log('\n📤 Sending funds to resolvers...');
    
    for (const resolver of resolvers) {
      console.log(`\n${resolver.name}:`);
      
      // Check current balances
      const currentEthBalance = await provider.getBalance(resolver.address);
      const currentWethBalance = await wethContract.balanceOf(resolver.address);
      
      console.log(`  Current ETH: ${ethers.formatEther(currentEthBalance)} ETH`);
      console.log(`  Current WETH: ${ethers.formatEther(currentWethBalance)} WETH`);
      
      // Send ETH
      if (currentEthBalance < ethers.parseEther('0.005')) {
        console.log(`  📤 Sending ${ethers.formatEther(ethAmount)} ETH...`);
        const ethTx = await resolver1Wallet.sendTransaction({
          to: resolver.address,
          value: ethAmount
        });
        await ethTx.wait();
        console.log(`  ✅ ETH sent: ${ethTx.hash}`);
      } else {
        console.log(`  ✓ Sufficient ETH balance`);
      }
      
      // Send WETH
      if (currentWethBalance < ethers.parseEther('0.001')) {
        console.log(`  📤 Sending ${ethers.formatEther(wethAmount)} WETH...`);
        const wethTx = await wethContract.transfer(resolver.address, wethAmount);
        await wethTx.wait();
        console.log(`  ✅ WETH sent: ${wethTx.hash}`);
      } else {
        console.log(`  ✓ Sufficient WETH balance`);
      }
    }
    
    // Final balance check
    console.log('\n📊 Final balances:');
    const finalEthBalance = await provider.getBalance(resolver1Wallet.address);
    const finalWethBalance = await wethContract.balanceOf(resolver1Wallet.address);
    console.log(`Resolver 1 ETH: ${ethers.formatEther(finalEthBalance)} ETH`);
    console.log(`Resolver 1 WETH: ${ethers.formatEther(finalWethBalance)} WETH`);
    
    for (const resolver of resolvers) {
      const ethBal = await provider.getBalance(resolver.address);
      const wethBal = await wethContract.balanceOf(resolver.address);
      console.log(`${resolver.name} - ETH: ${ethers.formatEther(ethBal)}, WETH: ${ethers.formatEther(wethBal)}`);
    }
    
  } catch (error) {
    console.error('Error funding resolvers:', error);
  }
}

// Run the funding script
fundResolvers();