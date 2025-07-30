const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const ETHEREUM_RPC = process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const PRIVATE_KEY = process.env.ETHEREUM_PRIVATE_KEY || 'c8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74';

// LayerZero V2 Testnet Endpoints
const LZ_ENDPOINTS = {
  'sepolia': '0x6EDCE65403992e310A62460808c4b910D972f10f',
  'aptos-testnet': '0x0000000000000000000000000000000000000000000000000000000000000001' // Placeholder
};

async function deployLayerZeroAdapter() {
  console.log('🚀 Deploying LayerZero Adapter');
  console.log('═'.repeat(80));
  
  const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log(`Deployer: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);
  
  if (balance < ethers.parseEther('0.01')) {
    console.log('⚠️  Insufficient balance. Need at least 0.01 ETH');
    return;
  }
  
  // Load contract artifacts
  const contractPath = path.join(__dirname, '../contracts/ethereum/artifacts/contracts/LayerZeroAdapter.sol/LayerZeroAdapter.json');
  
  if (!fs.existsSync(contractPath)) {
    console.log('⚠️  Contract artifacts not found. Run: cd contracts/ethereum && npx hardhat compile');
    return;
  }
  
  const LayerZeroAdapter = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  
  console.log('📝 Deploying LayerZeroAdapter...');
  
  const factory = new ethers.ContractFactory(
    LayerZeroAdapter.abi,
    LayerZeroAdapter.bytecode,
    wallet
  );
  
  // Deploy with owner
  const adapter = await factory.deploy(wallet.address);
  
  console.log(`TX Hash: ${adapter.deploymentTransaction().hash}`);
  console.log('Waiting for confirmation...');
  
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  
  console.log(`\n✅ LayerZeroAdapter deployed at: ${adapterAddress}`);
  
  // Configure the adapter
  console.log('\n🔧 Configuring LayerZero Adapter...');
  
  // Set LayerZero endpoint
  console.log('Setting LayerZero endpoint...');
  const setEndpointTx = await adapter.setLzEndpoint(LZ_ENDPOINTS.sepolia);
  await setEndpointTx.wait();
  console.log('✅ Endpoint set');
  
  // Set trusted remote for Aptos (endpoint ID 10108 for Aptos testnet)
  const APTOS_EID = 10108;
  const APTOS_ADDRESS = ethers.zeroPadValue('0x36f5260acde988971c690510e4f36b166e614e7dc16bb3b86dd19c758e38f577', 32);
  
  console.log('Setting Aptos trusted remote...');
  const setRemoteTx = await adapter.setTrustedRemote(APTOS_EID, APTOS_ADDRESS);
  await setRemoteTx.wait();
  console.log('✅ Trusted remote set');
  
  // Save deployment info
  const deploymentInfo = {
    network: 'sepolia',
    adapterAddress: adapterAddress,
    lzEndpoint: LZ_ENDPOINTS.sepolia,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    aptosEid: APTOS_EID,
    aptosTrustedRemote: APTOS_ADDRESS
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../deployments/layerzero-adapter-sepolia.json'),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log('\n📄 Deployment info saved to deployments/layerzero-adapter-sepolia.json');
  
  // Update escrow contract to integrate with adapter
  console.log('\n🔗 Next steps:');
  console.log('1. Update FusionPlusEscrow to integrate with LayerZeroAdapter at:', adapterAddress);
  console.log('2. Deploy Aptos LayerZero endpoint adapter');
  console.log('3. Test cross-chain secret reveals');
  
  return adapterAddress;
}

// Deploy if run directly
if (require.main === module) {
  deployLayerZeroAdapter()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { deployLayerZeroAdapter };