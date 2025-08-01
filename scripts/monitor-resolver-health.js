const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/resolver/.env' });

async function monitorHealth() {
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const resolverAddress = process.env.ETHEREUM_RESOLVER_ADDRESS;
    const wethAddress = process.env.WETH_ADDRESS;
    
    console.log('\n🏥 Resolver Health Check');
    console.log('='.repeat(50));
    console.log('Resolver address:', resolverAddress);
    console.log('Checking at:', new Date().toISOString());
    
    // Check ETH balance
    const ethBalance = await provider.getBalance(resolverAddress);
    const ethFormatted = ethers.formatEther(ethBalance);
    
    // Check WETH balance
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
    const wethBalance = await wethContract.balanceOf(resolverAddress);
    const wethFormatted = ethers.formatEther(wethBalance);
    
    console.log('\n💰 Current Balances:');
    console.log(`   ETH:  ${ethFormatted} ETH`);
    console.log(`   WETH: ${wethFormatted} WETH`);
    
    // Check health status
    const minEthNeeded = ethers.parseEther('0.01'); // For gas + safety deposit
    const minWethNeeded = ethers.parseEther('0.05'); // For small swaps
    
    console.log('\n🔍 Health Status:');
    
    let issues = [];
    
    if (ethBalance < minEthNeeded) {
        console.log('   ❌ CRITICAL: Insufficient ETH for gas');
        console.log(`      Need: ${ethers.formatEther(minEthNeeded)} ETH`);
        console.log(`      Have: ${ethFormatted} ETH`);
        issues.push('ETH');
    } else {
        console.log('   ✅ ETH balance OK');
    }
    
    if (wethBalance < minWethNeeded) {
        console.log('   ❌ CRITICAL: Insufficient WETH for swaps');
        console.log(`      Need: ${ethers.formatEther(minWethNeeded)} WETH`);
        console.log(`      Have: ${wethFormatted} WETH`);
        issues.push('WETH');
    } else {
        console.log('   ✅ WETH balance OK');
    }
    
    // Estimate how many swaps can be done
    const avgSwapSize = ethers.parseEther('0.01'); // Average 0.01 WETH per swap
    const possibleSwaps = wethBalance / avgSwapSize;
    
    console.log('\n📊 Capacity:');
    console.log(`   Can handle approximately ${possibleSwaps} more swaps`);
    console.log(`   (assuming average swap size of 0.01 WETH)`);
    
    // Recommendations
    if (issues.length > 0) {
        console.log('\n⚠️  ACTION REQUIRED:');
        console.log('   The resolver needs funding to continue operating.');
        
        if (issues.includes('ETH')) {
            console.log('\n   To fund ETH:');
            console.log('   1. Get Sepolia ETH from: https://sepoliafaucet.com/');
            console.log(`   2. Send to: ${resolverAddress}`);
        }
        
        if (issues.includes('WETH')) {
            console.log('\n   To fund WETH:');
            console.log('   1. Run: node scripts/wrap-eth-to-weth.js');
            console.log('   2. Or send WETH directly to resolver');
        }
        
        console.log('\n💡 WHY SWAPS FAIL AFTER WORKING ONCE:');
        console.log('   1. Each swap consumes resolver\'s WETH balance');
        console.log('   2. Resolver needs to hold destination assets (WETH) upfront');
        console.log('   3. When WETH runs out, new swaps cannot be created');
        console.log('   4. This is why the first swap works but subsequent ones fail');
    } else {
        console.log('\n✅ Resolver is healthy and ready for swaps!');
    }
    
    console.log('\n' + '='.repeat(50));
}

// Run once
monitorHealth().catch(console.error);

// Optional: Run periodically
// setInterval(() => monitorHealth().catch(console.error), 60000); // Every minute