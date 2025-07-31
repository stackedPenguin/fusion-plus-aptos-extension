const { AptosClient, AptosAccount, Types } = require('aptos');
const { ethers } = require('ethers');
require('dotenv').config();

// Aptos testnet client
const aptosClient = new AptosClient('https://fullnode.testnet.aptoslabs.com');

// Ethereum provider
const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo');

async function createAptosEscrow(orderData, secretHash) {
  try {
    // This would normally be done by the user's wallet
    console.log('\n📝 Creating APT source escrow on Aptos...');
    
    const escrowModule = process.env.APTOS_ESCROW_MODULE || '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';
    
    // In a real implementation, this would be done through the user's wallet
    console.log('   Module:', escrowModule);
    console.log('   Depositor:', orderData.maker);
    console.log('   Amount:', orderData.fromAmount);
    console.log('   Secret hash:', secretHash);
    
    // The payload for creating an APT escrow
    const payload = {
      type: 'entry_function_payload',
      function: `${escrowModule}::htlc::create_htlc`,
      type_arguments: ['0x1::aptos_coin::AptosCoin'],
      arguments: [
        orderData.maker, // depositor
        orderData.fromAmount, // amount (in octas)
        secretHash, // secret_hash
        Math.floor(Date.now() / 1000) + 3600, // timelock (1 hour)
        '100000' // safety_deposit (0.001 APT)
      ]
    };
    
    console.log('   Payload:', JSON.stringify(payload, null, 2));
    console.log('\n   ⚠️  Note: In production, this transaction would be signed and submitted by the user\'s wallet');
    
    return true;
  } catch (error) {
    console.error('Failed to create Aptos escrow:', error);
    return false;
  }
}

async function testAPTtoETHSwap() {
  console.log('=== Testing APT to ETH Swap ===\n');
  
  // Example order data (from your logs)
  const orderData = {
    fromChain: 'APTOS',
    toChain: 'ETHEREUM',
    fromToken: '0x1::aptos_coin::AptosCoin',
    toToken: '0x0000000000000000000000000000000000000000',
    fromAmount: '100000000', // 1 APT (8 decimals)
    minToAmount: '1174100000000000', // ~0.0011741 ETH
    maker: '0x3cf8d46b8ad3e1be66c7d42dbcb3f5f0241d86015bd4d521e65ed8df1a97633b',
    receiver: '0x17061146a55f31BB85c7e211143581B44f2a03d0',
    deadline: Math.floor(Date.now() / 1000) + 1800,
    nonce: Date.now().toString(),
    partialFillAllowed: false
  };
  
  console.log('Order details:');
  console.log('  From: 1 APT on Aptos');
  console.log('  To: ~0.0011741 ETH on Ethereum');
  console.log('  Maker (Aptos):', orderData.maker);
  console.log('  Receiver (Ethereum):', orderData.receiver);
  
  // Simulate the flow
  console.log('\n🔄 Swap Flow for APT to ETH:');
  console.log('1. User submits order to resolver ✅');
  console.log('2. Resolver validates order and checks profitability ✅');
  console.log('3. Resolver creates destination escrow on Ethereum (locks ETH) ✅');
  console.log('4. User creates source escrow on Aptos (locks APT) ⏳');
  console.log('5. Resolver reveals secret on Aptos to claim APT');
  console.log('6. User uses secret to claim ETH on Ethereum');
  
  // Example secret for demonstration
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  
  console.log('\n🔐 Example secret hash:', secretHash);
  
  // Show how to create the Aptos escrow
  await createAptosEscrow(orderData, secretHash);
  
  console.log('\n📋 Next Steps:');
  console.log('1. User needs to sign and submit the Aptos transaction to create the escrow');
  console.log('2. Once the escrow is created, emit an event to notify the resolver');
  console.log('3. Resolver will then reveal the secret on Aptos');
  console.log('4. User can claim the ETH using the revealed secret');
  
  console.log('\n💡 Implementation Notes:');
  console.log('- APT escrows require user wallet interaction (unlike WETH which can use approve/transferFrom)');
  console.log('- The frontend should guide users through the escrow creation process');
  console.log('- Consider adding a "Create Escrow" button that appears after resolver creates destination escrow');
}

// Run the test
testAPTtoETHSwap().catch(console.error);