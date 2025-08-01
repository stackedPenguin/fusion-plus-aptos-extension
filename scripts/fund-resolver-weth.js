const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/resolver/.env' });

async function fundResolver() {
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    
    // Use a funded test account (you'll need to provide this)
    const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || process.env.ETHEREUM_PRIVATE_KEY;
    const signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);
    
    const resolverAddress = process.env.ETHEREUM_RESOLVER_ADDRESS;
    const wethAddress = process.env.WETH_ADDRESS;
    
    console.log('Funding resolver with WETH...');
    console.log('Funder address:', await signer.getAddress());
    console.log('Resolver address:', resolverAddress);
    console.log('WETH address:', wethAddress);
    
    // First, wrap some ETH to WETH
    const wethAbi = [
        'function deposit() payable',
        'function transfer(address to, uint256 amount) returns (bool)',
        'function balanceOf(address) view returns (uint256)'
    ];
    
    const wethContract = new ethers.Contract(wethAddress, wethAbi, signer);
    
    try {
        // Check funder's ETH balance
        const ethBalance = await provider.getBalance(await signer.getAddress());
        console.log('\nFunder ETH balance:', ethers.formatEther(ethBalance), 'ETH');
        
        if (ethBalance < ethers.parseEther('0.2')) {
            console.error('Funder needs at least 0.2 ETH!');
            console.log('Get testnet ETH from: https://sepoliafaucet.com/');
            return;
        }
        
        // Wrap 0.1 ETH to WETH
        console.log('\nWrapping 0.1 ETH to WETH...');
        const depositTx = await wethContract.deposit({ value: ethers.parseEther('0.1') });
        console.log('Wrap transaction:', depositTx.hash);
        await depositTx.wait();
        console.log('✅ ETH wrapped successfully!');
        
        // Check WETH balance
        const wethBalance = await wethContract.balanceOf(await signer.getAddress());
        console.log('Funder WETH balance:', ethers.formatEther(wethBalance), 'WETH');
        
        // Transfer WETH to resolver
        console.log('\nTransferring 0.1 WETH to resolver...');
        const transferTx = await wethContract.transfer(resolverAddress, ethers.parseEther('0.1'));
        console.log('Transfer transaction:', transferTx.hash);
        await transferTx.wait();
        console.log('✅ WETH transferred successfully!');
        
        // Check final balances
        const resolverWethBalance = await wethContract.balanceOf(resolverAddress);
        console.log('\nResolver WETH balance:', ethers.formatEther(resolverWethBalance), 'WETH');
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

fundResolver().catch(console.error);