const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/resolver/.env' });

async function transferETH() {
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const signer = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, provider);
    const recipientAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
    const amountToSend = ethers.parseEther('0.1');
    
    console.log('\n💸 ETH Transfer Tool');
    console.log('='.repeat(50));
    console.log('From (Resolver):', await signer.getAddress());
    console.log('To (Your address):', recipientAddress);
    console.log('Amount:', ethers.formatEther(amountToSend), 'ETH');
    
    try {
        // Check current balance
        const balance = await provider.getBalance(await signer.getAddress());
        console.log('\nResolver ETH balance:', ethers.formatEther(balance), 'ETH');
        
        // Make sure we have enough (0.1 ETH + gas)
        const totalNeeded = amountToSend + ethers.parseEther('0.01'); // 0.01 for gas
        if (balance < totalNeeded) {
            console.error('\n❌ Insufficient balance');
            console.error(`   Need: ${ethers.formatEther(totalNeeded)} ETH`);
            console.error(`   Have: ${ethers.formatEther(balance)} ETH`);
            return;
        }
        
        console.log('\n📤 Sending transaction...');
        const tx = await signer.sendTransaction({
            to: recipientAddress,
            value: amountToSend
        });
        
        console.log('Transaction hash:', tx.hash);
        console.log('Waiting for confirmation...');
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('\n✅ ETH transferred successfully!');
            console.log('Block number:', receipt.blockNumber);
            console.log('Gas used:', receipt.gasUsed.toString());
            
            // Check new balance
            const newBalance = await provider.getBalance(await signer.getAddress());
            console.log('\nResolver new ETH balance:', ethers.formatEther(newBalance), 'ETH');
            
            console.log('\n🎉 Success! Sent 0.1 ETH to', recipientAddress);
            console.log('You can now wrap it to WETH from your wallet');
        } else {
            console.error('\n❌ Transaction failed!');
        }
        
    } catch (error) {
        console.error('\n❌ Error transferring ETH:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
}

transferETH().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});