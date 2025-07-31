const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');

async function checkCoinStore() {
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  const resolverAddress = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
  
  try {
    // Check if coin store exists
    const resource = await aptos.getAccountResource({
      accountAddress: resolverAddress,
      resourceType: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
    });
    
    console.log('Coin store found!');
    console.log('Balance:', resource.coin.value);
    console.log('Frozen:', resource.frozen);
    
    // Also check balance using view function
    const [balance] = await aptos.view({
      payload: {
        function: '0x1::coin::balance',
        typeArguments: ['0x1::aptos_coin::AptosCoin'],
        functionArguments: [resolverAddress]
      }
    });
    
    console.log('Balance from view function:', balance);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.log('Coin store may not exist');
  }
}

checkCoinStore();