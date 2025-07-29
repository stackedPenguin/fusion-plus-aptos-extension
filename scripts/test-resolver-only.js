// Test resolver execution without order engine
const { ethers } = require('ethers');

async function testResolverExecution() {
  console.log('=== Testing Resolver Execution Directly ===\n');

  // Setup
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const resolverPrivateKey = '0xc8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74';
  const resolverWallet = new ethers.Wallet(resolverPrivateKey, provider);
  
  const ESCROW_ADDRESS = '0x8aD67A61dFdEF53061aEa393b7213E2EF4b7B150';
  const ESCROW_ABI = [
    'function createEscrow(bytes32 escrowId, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock) payable',
    'function getEscrow(bytes32 escrowId) view returns (tuple(address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit))'
  ];

  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, resolverWallet);

  // Test parameters
  const testEscrowId = ethers.id('test-' + Date.now());
  const beneficiary = resolverWallet.address;
  const token = ethers.ZeroAddress; // ETH
  const amount = ethers.parseEther('0.001');
  const secret = ethers.randomBytes(32);
  const hashlock = ethers.keccak256(secret);
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const safetyDeposit = ethers.parseEther('0.01');

  console.log('Test Parameters:');
  console.log('- Escrow ID:', testEscrowId);
  console.log('- Beneficiary:', beneficiary);
  console.log('- Amount:', ethers.formatEther(amount), 'ETH');
  console.log('- Safety Deposit:', ethers.formatEther(safetyDeposit), 'ETH');
  console.log('- Hashlock:', hashlock);
  console.log('- Timelock:', new Date(timelock * 1000).toISOString());

  try {
    // Check resolver balance
    const balance = await provider.getBalance(resolverWallet.address);
    console.log('\nResolver Balance:', ethers.formatEther(balance), 'ETH');

    if (balance < safetyDeposit) {
      console.error('❌ Insufficient balance for safety deposit');
      return;
    }

    // Try to create escrow
    console.log('\nCreating escrow...');
    
    // First check if contract exists
    const code = await provider.getCode(ESCROW_ADDRESS);
    console.log('Contract code length:', code.length);
    if (code === '0x') {
      console.error('❌ No contract deployed at address:', ESCROW_ADDRESS);
      return;
    }
    
    const tx = await escrowContract.createEscrow(
      testEscrowId,
      beneficiary,
      token,
      amount,
      hashlock,
      timelock,
      { 
        value: safetyDeposit,
        gasLimit: 300000 // Set explicit gas limit
      }
    );

    console.log('Transaction sent:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('✅ Escrow created successfully!');
    console.log('Gas used:', receipt.gasUsed.toString());
    console.log('Block:', receipt.blockNumber);

    // Read back the escrow
    const escrowData = await escrowContract.getEscrow(testEscrowId);
    console.log('\nEscrow Data:');
    console.log('- Depositor:', escrowData[0]);
    console.log('- Beneficiary:', escrowData[1]);
    console.log('- Amount:', ethers.formatEther(escrowData[3]));
    console.log('- Safety Deposit:', ethers.formatEther(escrowData[8]));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    if (error.reason) {
      console.error('Reason:', error.reason);
    }
    if (error.transaction) {
      console.error('Transaction:', error.transaction);
    }
  }
}

testResolverExecution().catch(console.error);