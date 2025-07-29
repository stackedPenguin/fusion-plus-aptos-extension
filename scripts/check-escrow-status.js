const { ethers } = require('ethers');

async function checkEscrowStatus() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  // New escrow contract address
  const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
  const ESCROW_ABI = [
    'function getEscrow(bytes32 escrowId) view returns (tuple(address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit))',
    'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)'
  ];

  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);

  console.log('=== Checking Recent Escrows ===\n');
  console.log('Contract:', ESCROW_ADDRESS);

  // Get recent events
  const filter = escrowContract.filters.EscrowCreated();
  const currentBlock = await provider.getBlockNumber();
  const events = await escrowContract.queryFilter(filter, currentBlock - 100, currentBlock);

  console.log(`\nFound ${events.length} escrows in last 100 blocks:\n`);

  for (const event of events) {
    const escrowId = event.args[0];
    console.log(`Escrow ID: ${escrowId}`);
    console.log(`Depositor: ${event.args[1]}`);
    console.log(`Beneficiary: ${event.args[2]}`);
    console.log(`Token: ${event.args[3]}`);
    console.log(`Amount: ${ethers.formatEther(event.args[4])}`);
    console.log(`Block: ${event.blockNumber}`);
    console.log(`Tx: ${event.transactionHash}`);
    
    // Get current escrow state
    try {
      const escrow = await escrowContract.getEscrow(escrowId);
      console.log(`Status: ${escrow[6] ? 'WITHDRAWN' : escrow[7] ? 'REFUNDED' : 'ACTIVE'}`);
      console.log(`Safety Deposit: ${ethers.formatEther(escrow[8])} ETH`);
    } catch (error) {
      console.log('Status: Error reading escrow');
    }
    console.log('---');
  }

  // Check contract balance
  const balance = await provider.getBalance(ESCROW_ADDRESS);
  console.log(`\nContract Balance: ${ethers.formatEther(balance)} ETH`);
}

checkEscrowStatus().catch(console.error);