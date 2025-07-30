const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const escrowAddress = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
  const resolverAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
  
  // Check resolver ETH balance for safety deposit
  const resolverBalance = await provider.getBalance(resolverAddress);
  console.log('Resolver ETH balance:', ethers.formatEther(resolverBalance), 'ETH');
  console.log('Safety deposit required: 0.001 ETH');
  console.log('Has enough for safety deposit:', resolverBalance >= ethers.parseEther('0.001'));
  
  // Decode the failing transaction
  const data = '0xd6f1b1e25637eba0b80ee331d217c25108724e935236a8aa65c15ff2e4851f22fc80ccdb0000000000000000000000004718eafbbdc0ddaafeb520ff641c6aecba8042fc000000000000000000000000fff9976782d46cc05630d1f6ebab18b2324d6b140000000000000000000000000000000000000000000000000001c6bf52634000d7f8e00fe97f5c427e1e89fcba4ca5b4d3352360a77acf1eaad85ea1b9ddc86b00000000000000000000000000000000000000000000000000000000688a8427';
  const iface = new ethers.Interface(['function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable']);
  const decoded = iface.parseTransaction({ data });
  
  console.log('\nTransaction details:');
  console.log('Escrow ID:', decoded.args[0]);
  console.log('Beneficiary:', decoded.args[1]);
  console.log('Token:', decoded.args[2]);
  console.log('Amount:', ethers.formatEther(decoded.args[3]), 'WETH');
  console.log('Hashlock:', decoded.args[4]);
  console.log('Timelock:', new Date(Number(decoded.args[5]) * 1000).toISOString());
  
  // Check if escrow already exists
  const abi = ['function escrows(bytes32) view returns (address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit)'];
  const contract = new ethers.Contract(escrowAddress, abi, provider);
  const escrowId = decoded.args[0];
  
  try {
    const escrow = await contract.escrows(escrowId);
    const exists = escrow.depositor !== ethers.ZeroAddress;
    console.log('\nEscrow check:');
    console.log('Escrow exists:', exists);
    
    if (exists) {
      console.log('Existing escrow details:');
      console.log('  Depositor:', escrow.depositor);
      console.log('  Beneficiary:', escrow.beneficiary);
      console.log('  Token:', escrow.token);
      console.log('  Amount:', ethers.formatEther(escrow.amount));
      console.log('  Withdrawn:', escrow.withdrawn);
      console.log('  Refunded:', escrow.refunded);
    }
  } catch (error) {
    console.error('Error checking escrow:', error.message);
  }
  
  // Try to simulate the transaction with value
  console.log('\nSimulating transaction with safety deposit...');
  try {
    const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY || 'dummy', provider);
    const escrowContract = new ethers.Contract(escrowAddress, iface, wallet);
    
    // Try to estimate gas
    const gasEstimate = await escrowContract.createEscrow.estimateGas(
      decoded.args[0],
      decoded.args[1],
      decoded.args[2],
      decoded.args[3],
      decoded.args[4],
      decoded.args[5],
      { value: ethers.parseEther('0.001') }
    );
    
    console.log('Gas estimate successful:', gasEstimate.toString());
  } catch (error) {
    console.error('Gas estimation failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
  }
}

main().catch(console.error);