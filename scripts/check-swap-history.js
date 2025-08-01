const { ethers } = require('ethers');
require('dotenv').config({ path: './backend/resolver/.env' });

async function checkSwapHistory() {
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const resolverAddress = process.env.ETHEREUM_RESOLVER_ADDRESS;
    const wethAddress = process.env.WETH_ADDRESS;
    const escrowAddress = process.env.ETHEREUM_ESCROW_ADDRESS;
    
    console.log('Checking swap history...');
    console.log('Resolver:', resolverAddress);
    console.log('WETH:', wethAddress);
    console.log('Escrow:', escrowAddress);
    console.log('');
    
    // Check escrow events from the last 1000 blocks
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 1000;
    
    // Define event signatures
    const escrowCreatedTopic = ethers.id('EscrowCreated(bytes32,address,address,address,uint256,bytes32,uint256)');
    const escrowWithdrawnTopic = ethers.id('EscrowWithdrawn(bytes32,address,bytes32)');
    
    console.log(`Scanning blocks ${fromBlock} to ${currentBlock}...`);
    
    try {
        // Get EscrowCreated events
        const createdLogs = await provider.getLogs({
            address: escrowAddress,
            topics: [escrowCreatedTopic],
            fromBlock,
            toBlock: currentBlock
        });
        
        console.log(`\nFound ${createdLogs.length} escrow creation events:`);
        
        for (const log of createdLogs) {
            const iface = new ethers.Interface([
                'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)'
            ]);
            
            const parsed = iface.parseLog(log);
            const amount = parsed.args.amount;
            const token = parsed.args.token;
            const depositor = parsed.args.depositor;
            
            console.log(`\n📦 Escrow Created:`);
            console.log(`   Block: ${log.blockNumber}`);
            console.log(`   TX: ${log.transactionHash}`);
            console.log(`   Depositor: ${depositor}`);
            console.log(`   Token: ${token === ethers.ZeroAddress ? 'ETH' : token === wethAddress ? 'WETH' : token}`);
            console.log(`   Amount: ${ethers.formatEther(amount)}`);
            
            // Check if this was from resolver
            if (depositor.toLowerCase() === resolverAddress.toLowerCase()) {
                console.log(`   ✅ This was a resolver escrow!`);
            }
        }
        
        // Get EscrowWithdrawn events
        const withdrawnLogs = await provider.getLogs({
            address: escrowAddress,
            topics: [escrowWithdrawnTopic],
            fromBlock,
            toBlock: currentBlock
        });
        
        console.log(`\n\nFound ${withdrawnLogs.length} escrow withdrawal events.`);
        
    } catch (error) {
        console.error('Error checking history:', error);
    }
    
    // Check current balances
    console.log('\n\n📊 Current Resolver Status:');
    const ethBalance = await provider.getBalance(resolverAddress);
    console.log(`ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);
    
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
    const wethBalance = await wethContract.balanceOf(resolverAddress);
    console.log(`WETH Balance: ${ethers.formatEther(wethBalance)} WETH`);
    
    // Check recent transactions
    console.log('\n📜 Recent transactions from resolver:');
    const latestBlock = await provider.getBlock('latest');
    let found = 0;
    
    for (let i = 0; i < 100 && found < 5; i++) {
        const block = await provider.getBlock(currentBlock - i, true);
        if (block && block.transactions) {
            for (const tx of block.transactions) {
                if (tx.from && tx.from.toLowerCase() === resolverAddress.toLowerCase()) {
                    console.log(`\n   TX: ${tx.hash}`);
                    console.log(`   Block: ${tx.blockNumber}`);
                    console.log(`   To: ${tx.to}`);
                    console.log(`   Value: ${ethers.formatEther(tx.value)} ETH`);
                    found++;
                    if (found >= 5) break;
                }
            }
        }
    }
}

checkSwapHistory().catch(console.error);