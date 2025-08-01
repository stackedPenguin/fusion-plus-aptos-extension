const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/resolver/.env' });

async function checkBalance() {
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const resolverAddress = process.env.ETHEREUM_RESOLVER_ADDRESS;
    const wethAddress = process.env.WETH_ADDRESS;
    
    console.log('Checking resolver balance...');
    console.log('Resolver address:', resolverAddress);
    
    // Check ETH balance
    const ethBalance = await provider.getBalance(resolverAddress);
    console.log('ETH balance:', ethers.formatEther(ethBalance), 'ETH');
    
    // Check WETH balance
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
    const wethBalance = await wethContract.balanceOf(resolverAddress);
    console.log('WETH balance:', ethers.formatEther(wethBalance), 'WETH');
    
    // Check if resolver needs funding
    const minEthNeeded = ethers.parseEther('0.01'); // For gas + safety deposit
    const minWethNeeded = ethers.parseEther('0.1'); // For test swaps
    
    if (ethBalance < minEthNeeded) {
        console.log('\n⚠️  Resolver needs more ETH for gas!');
        console.log('   Need at least:', ethers.formatEther(minEthNeeded), 'ETH');
    }
    
    if (wethBalance < minWethNeeded) {
        console.log('\n⚠️  Resolver needs more WETH for swaps!');
        console.log('   Need at least:', ethers.formatEther(minWethNeeded), 'WETH');
    }
}

checkBalance().catch(console.error);