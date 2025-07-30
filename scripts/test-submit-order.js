const axios = require('axios');

const ORDER_ENGINE_URL = 'http://localhost:3001';

async function submitTestOrder() {
  console.log('📤 Submitting Test Order');
  console.log('═'.repeat(60));

  const order = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: '0x0000000000000000000000000000000000000000',
    toToken: '0x1::aptos_coin::AptosCoin',
    fromAmount: '500000000000000', // 0.0005 ETH
    minToAmount: '41000000', // 0.41 APT
    maker: '0x4479B0150248772B44B63817c11c589a25957e85',
    receiver: '0x3cf8d46b8ad3e1be66c7d42dbcb3f5f0241d86015bd4d521e65ed8df1a97633b',
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString(),
    partialFillAllowed: false,
    signature: '0x00' // Dev mode
  };

  try {
    console.log('Order details:');
    console.log(`  From: ${order.fromAmount} wei (${parseFloat(order.fromAmount) / 1e18} ETH)`);
    console.log(`  To: ${order.minToAmount} units (${parseFloat(order.minToAmount) / 1e8} APT)`);
    console.log(`  Receiver: ${order.receiver}`);
    
    const response = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, order);
    console.log('\n✅ Order submitted successfully!');
    console.log(`Order ID: ${response.data.data?.id || 'unknown'}`);
    
    console.log('\n⏳ Check resolver logs for escrow creation...');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

submitTestOrder().catch(console.error);