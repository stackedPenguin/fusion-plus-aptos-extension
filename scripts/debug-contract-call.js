const { ethers } = require('ethers');

async function debugContractCall() {
  console.log('=== Debugging Contract Call ===\n');

  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const resolverPrivateKey = '0xc8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74';
  const resolverWallet = new ethers.Wallet(resolverPrivateKey, provider);
  
  const ESCROW_ADDRESS = '0x8aD67A61dFdEF53061aEa393b7213E2EF4b7B150';
  
  // Create a simple call to see if we can interact with the contract
  const iface = new ethers.Interface([
    'function createEscrow(bytes32 escrowId, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock) payable'
  ]);

  const testEscrowId = ethers.id('test-' + Date.now());
  const beneficiary = resolverWallet.address;
  const token = ethers.ZeroAddress;
  const amount = ethers.parseEther('0.001');
  const hashlock = ethers.keccak256(ethers.randomBytes(32));
  const timelock = Math.floor(Date.now() / 1000) + 3600;

  try {
    // Encode the function call
    const data = iface.encodeFunctionData('createEscrow', [
      testEscrowId,
      beneficiary,
      token,
      amount,
      hashlock,
      timelock
    ]);

    console.log('Encoded data:', data);
    console.log('Data length:', data.length);

    // Try sending transaction manually
    const tx = {
      to: ESCROW_ADDRESS,
      from: resolverWallet.address,
      data: data,
      value: ethers.parseEther('0.01'),
      gasLimit: 300000
    };

    console.log('\nTransaction object:', tx);

    // Estimate gas first
    try {
      const estimatedGas = await provider.estimateGas(tx);
      console.log('Estimated gas:', estimatedGas.toString());
    } catch (error) {
      console.error('Gas estimation failed:', error.message);
      if (error.data) {
        console.log('Error data:', error.data);
      }
    }

    // Send transaction
    const sentTx = await resolverWallet.sendTransaction(tx);
    console.log('\nTransaction sent:', sentTx.hash);
    console.log('Transaction data in sent tx:', sentTx.data);
    
    const receipt = await sentTx.wait();
    console.log('Receipt status:', receipt.status);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.transaction) {
      console.log('\nFailed transaction:', error.transaction);
    }
  }
}

debugContractCall().catch(console.error);