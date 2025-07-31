const { AptosClient, AptosAccount, HexString, CoinClient } = require('aptos');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function fundTestWallet() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  const coinClient = new CoinClient(client);
  
  // Source wallet (resolver/admin)
  let sourcePrivateKey = process.env.APTOS_PRIVATE_KEY;
  if (!sourcePrivateKey) {
    throw new Error('APTOS_PRIVATE_KEY not found in environment');
  }
  
  if (sourcePrivateKey.startsWith('ed25519-priv-')) {
    sourcePrivateKey = sourcePrivateKey.replace('ed25519-priv-', '');
  }
  if (sourcePrivateKey.startsWith('0x')) {
    sourcePrivateKey = sourcePrivateKey.substring(2);
  }
  
  const sourceAccount = new AptosAccount(new HexString(sourcePrivateKey).toUint8Array());
  console.log('Source wallet:', sourceAccount.address().hex());
  
  // Check source balance
  const sourceBalance = await client.getAccountCoinAmount({
    accountAddress: sourceAccount.address(),
    coinType: '0x1::aptos_coin::AptosCoin'
  });
  console.log('Source balance:', sourceBalance / 100000000, 'APT');
  
  // Test wallet to fund
  const testWalletAddress = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
  
  // Transfer amount (0.5 APT for testing)
  const transferAmount = 50000000; // 0.5 APT
  
  if (sourceBalance < transferAmount) {
    console.error('Insufficient balance in source wallet');
    return;
  }
  
  console.log(`\nTransferring ${transferAmount / 100000000} APT to ${testWalletAddress}...`);
  
  try {
    const txHash = await coinClient.transfer(
      sourceAccount,
      testWalletAddress,
      transferAmount,
      {
        coinType: '0x1::aptos_coin::AptosCoin'
      }
    );
    
    console.log('Transfer transaction:', txHash);
    
    // Wait for transaction
    await client.waitForTransaction(txHash);
    
    // Check new balance
    const newBalance = await client.getAccountCoinAmount({
      accountAddress: testWalletAddress,
      coinType: '0x1::aptos_coin::AptosCoin'
    });
    console.log('Test wallet new balance:', newBalance / 100000000, 'APT');
    
  } catch (error) {
    console.error('Transfer failed:', error);
  }
}

fundTestWallet().catch(console.error);