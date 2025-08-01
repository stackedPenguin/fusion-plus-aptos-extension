const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');

async function createNewAccount() {
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  try {
    // Generate a new account
    const newAccount = Account.generate();
    
    console.log('New account generated:');
    console.log('Address:', newAccount.accountAddress.toString());
    console.log('Private Key:', newAccount.privateKey.toString());
    console.log('Public Key:', newAccount.publicKey.toString());
    
    // Save the account details first
    const accountDetails = {
      address: newAccount.accountAddress.toString(),
      privateKey: newAccount.privateKey.toString(),
      publicKey: newAccount.publicKey.toString()
    };
    
    fs.writeFileSync(
      path.join(__dirname, 'new-escrow-account.json'),
      JSON.stringify(accountDetails, null, 2)
    );
    
    console.log('\nAccount details saved to new-escrow-account.json');
    
    // Try to fund the account using faucet
    console.log('\nTrying to fund account from faucet...');
    try {
      const transaction = await aptos.fundAccount({
        accountAddress: newAccount.accountAddress,
        amount: 100000000 // 1 APT
      });
      console.log('Funding transaction:', transaction);
      console.log('Account funded successfully!');
    } catch (fundError) {
      console.log('\n⚠️  Could not fund automatically. Please fund this account manually:');
      console.log('Address:', newAccount.accountAddress.toString());
      console.log('You can use https://aptos.dev/network/faucet or transfer from another account');
    }
    
    console.log('\nNext steps:');
    console.log('1. Fund the account if not already funded');
    console.log('2. Update Move.toml with this address');
    console.log('3. Deploy the contract');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createNewAccount();