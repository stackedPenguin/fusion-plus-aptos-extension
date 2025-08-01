const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/resolver/.env' });

// Use the same WETH ABI as frontend
const WETH_ABI = [
  {
    "inputs": [],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function wrapETH() {
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const signer = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, provider);
    const wethAddress = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    
    console.log('\n💸 ETH to WETH Wrapping Tool');
    console.log('='.repeat(50));
    console.log('Resolver address:', await signer.getAddress());
    console.log('WETH address:', wethAddress);
    console.log('Network:', process.env.ETHEREUM_RPC_URL);
    
    const wethContract = new ethers.Contract(wethAddress, WETH_ABI, signer);
    
    try {
        // Check current balances
        const ethBalance = await provider.getBalance(await signer.getAddress());
        const wethBalance = await wethContract.balanceOf(await signer.getAddress());
        
        console.log('\n📊 Current balances:');
        console.log('   ETH:  ' + ethers.formatEther(ethBalance) + ' ETH');
        console.log('   WETH: ' + ethers.formatEther(wethBalance) + ' WETH');
        
        // Calculate how much we can wrap
        const minEthToKeep = ethers.parseEther('0.05'); // Keep 0.05 ETH for gas
        const amountToWrap = ethers.parseEther('0.1'); // Wrap 0.1 ETH
        const totalNeeded = minEthToKeep + amountToWrap;
        
        if (ethBalance < totalNeeded) {
            console.error('\n❌ Insufficient ETH balance');
            console.error(`   Need: ${ethers.formatEther(totalNeeded)} ETH (0.1 to wrap + 0.05 for gas)`);
            console.error(`   Have: ${ethers.formatEther(ethBalance)} ETH`);
            console.error('\n💡 Get testnet ETH from: https://sepoliafaucet.com/');
            return;
        }
        
        // Wrap ETH using the same method as frontend
        console.log('\n🔄 Wrapping 0.1 ETH to WETH...');
        console.log('   Sending transaction...');
        
        // Use deposit() exactly like the frontend
        const tx = await wethContract.deposit({ value: amountToWrap });
        console.log('   Transaction hash:', tx.hash);
        console.log('   Waiting for confirmation...');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('\n✅ ETH wrapped successfully!');
            console.log('   Block number:', receipt.blockNumber);
            console.log('   Gas used:', receipt.gasUsed.toString());
            
            // Wait a moment for state to update
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check new balances
            const newEthBalance = await provider.getBalance(await signer.getAddress());
            const newWethBalance = await wethContract.balanceOf(await signer.getAddress());
            
            console.log('\n📊 New balances:');
            console.log('   ETH:  ' + ethers.formatEther(newEthBalance) + ' ETH');
            console.log('   WETH: ' + ethers.formatEther(newWethBalance) + ' WETH');
            
            const wethGained = newWethBalance - wethBalance;
            console.log('\n🎉 Success! Gained ' + ethers.formatEther(wethGained) + ' WETH');
            
            // Check if we have enough WETH now
            const minWethNeeded = ethers.parseEther('0.05');
            if (newWethBalance >= minWethNeeded) {
                console.log('✅ Resolver now has sufficient WETH for swaps!');
            } else {
                console.log('⚠️  May need to wrap more ETH for additional swaps');
            }
        } else {
            console.error('\n❌ Transaction failed!');
            console.error('   Receipt status:', receipt.status);
        }
        
    } catch (error) {
        console.error('\n❌ Error wrapping ETH:', error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error('   Insufficient ETH for gas fees');
        } else if (error.code === 'NETWORK_ERROR') {
            console.error('   Network connection issue');
        } else {
            console.error('   Full error:', error);
        }
    }
    
    console.log('\n' + '='.repeat(50));
}

// Run the wrap function
wrapETH().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});