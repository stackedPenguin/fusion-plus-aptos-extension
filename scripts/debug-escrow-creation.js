const { ethers } = require('ethers');

async function debugEscrowCreation() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const privateKey = '0xc8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74';
  const signer = new ethers.Wallet(privateKey, provider);
  
  const escrowAddress = '0x5Ea57C2Fb5f054E9bdBdb3449135f823439E1338';
  const escrowAbi = [
    'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
    'function escrowExists(bytes32 _escrowId) view returns (bool)',
    'function getEscrow(bytes32 _escrowId) view returns (address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded)'
  ];
  
  const escrowContract = new ethers.Contract(escrowAddress, escrowAbi, signer);
  
  // Test parameters similar to what the resolver would use
  const testEscrowId = ethers.id('test-escrow-' + Date.now());
  const beneficiary = '0x17061146a55f31BB85c7e211143581B44f2a03d0'; // User address from logs
  const token = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // WETH
  const amount = ethers.parseEther('0.00012'); // Small amount
  const hashlock = ethers.keccak256(ethers.randomBytes(32));
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const safetyDeposit = ethers.parseEther('0.001');
  
  console.log('Debug Escrow Creation');
  console.log('====================');
  console.log('Escrow Address:', escrowAddress);
  console.log('Signer Address:', await signer.getAddress());
  console.log('Parameters:');
  console.log('  - Escrow ID:', testEscrowId);
  console.log('  - Beneficiary:', beneficiary);
  console.log('  - Token (WETH):', token);
  console.log('  - Amount:', ethers.formatEther(amount), 'WETH');
  console.log('  - Hashlock:', hashlock);
  console.log('  - Timelock:', new Date(timelock * 1000).toISOString());
  console.log('  - Safety Deposit:', ethers.formatEther(safetyDeposit), 'ETH');
  
  // Check balances
  const ethBalance = await provider.getBalance(signer.address);
  const wethContract = new ethers.Contract(token, ['function balanceOf(address) view returns (uint256)'], provider);
  const wethBalance = await wethContract.balanceOf(signer.address);
  
  console.log('\nBalances:');
  console.log('  - ETH:', ethers.formatEther(ethBalance));
  console.log('  - WETH:', ethers.formatEther(wethBalance));
  
  // Check if escrow already exists
  try {
    const exists = await escrowContract.escrowExists(testEscrowId);
    console.log('  - Escrow exists:', exists);
  } catch (error) {
    console.log('  - Cannot check escrow existence:', error.message);
  }
  
  // Try to estimate gas
  try {
    const gasEstimate = await escrowContract.createEscrow.estimateGas(
      testEscrowId,
      beneficiary,
      token,
      amount,
      hashlock,
      timelock,
      { value: safetyDeposit }
    );
    console.log('  - Gas estimate:', gasEstimate.toString());
  } catch (error) {
    console.log('  - Gas estimation failed:', error.message);
    
    // Try to decode the revert reason
    if (error.data) {
      console.log('  - Error data:', error.data);
    }
    
    return;
  }
  
  // Try to create the escrow
  try {
    console.log('\nAttempting to create escrow...');
    const tx = await escrowContract.createEscrow(
      testEscrowId,
      beneficiary,
      token,
      amount,
      hashlock,
      timelock,
      { value: safetyDeposit }
    );
    
    console.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
    
  } catch (error) {
    console.log('Transaction failed:', error.message);
    if (error.receipt) {
      console.log('Receipt:', error.receipt);
    }
  }
}

debugEscrowCreation().catch(console.error);