const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function registerCoinStore() {
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  try {
    // Get resolver's private key
    let privateKey = process.env.APTOS_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('APTOS_PRIVATE_KEY not found in environment');
    }
    
    // Remove prefixes if present
    if (privateKey.startsWith('ed25519-priv-')) {
      privateKey = privateKey.replace('ed25519-priv-', '');
    }
    if (privateKey.startsWith('0x')) {
      privateKey = privateKey.substring(2);
    }
    
    // Create account from private key
    const privateKeyObj = new Ed25519PrivateKey(privateKey);
    const account = Account.fromPrivateKey({ privateKey: privateKeyObj });
    
    console.log('Resolver address:', account.accountAddress.toString());
    
    // Register coin store
    console.log('Registering coin store...');
    
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: '0x1::managed_coin::register',
        typeArguments: ['0x1::aptos_coin::AptosCoin'],
        functionArguments: []
      }
    });
    
    const senderAuthenticator = aptos.transaction.sign({
      signer: account,
      transaction
    });
    
    const pendingTx = await aptos.transaction.submit.simple({
      transaction,
      senderAuthenticator
    });
    
    console.log('Transaction submitted:', pendingTx.hash);
    
    // Wait for confirmation
    const executedTx = await aptos.waitForTransaction({
      transactionHash: pendingTx.hash
    });
    
    console.log('Transaction confirmed!');
    console.log('Success:', executedTx.success);
    
    if (executedTx.success) {
      // Check balance
      const [balance] = await aptos.view({
        payload: {
          function: '0x1::coin::balance',
          typeArguments: ['0x1::aptos_coin::AptosCoin'],
          functionArguments: [account.accountAddress.toString()]
        }
      });
      
      console.log('Current balance:', (parseInt(balance) / 100000000).toFixed(8), 'APT');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

registerCoinStore();