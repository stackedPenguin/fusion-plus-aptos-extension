const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

async function main() {
  // Connect to testnet
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);

  // Use the private key from .env.resolver3 that we used for deployment
  const privateKeyHex = '7c7ac1c8279011232286dd94ad54b3fc17a37ee1f7df3b9d337825dfb64b0a2b';
  const privateKey = new Ed25519PrivateKey(privateKeyHex);
  const account = Account.fromPrivateKey({ privateKey });

  console.log('Deployer address:', account.accountAddress.toString());

  const MODULE_ADDRESS = '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8';
  const RESOLVER_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';

  try {
    // Initialize basic escrow module
    console.log('\nInitializing escrow module...');
    const initTx = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::escrow::initialize`,
        typeArguments: [],
        functionArguments: []
      }
    });

    const initCommittedTx = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction: initTx
    });

    await aptos.waitForTransaction({ transactionHash: initCommittedTx.hash });
    console.log('✅ Escrow initialized:', initCommittedTx.hash);

    // Add resolver to whitelist
    console.log('\nAdding resolver to whitelist...');
    const addResolverTx = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::escrow::add_authorized_resolver`,
        typeArguments: [],
        functionArguments: [RESOLVER_ADDRESS]
      }
    });

    const addResolverCommittedTx = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction: addResolverTx
    });

    await aptos.waitForTransaction({ transactionHash: addResolverCommittedTx.hash });
    console.log('✅ Resolver added to whitelist:', addResolverCommittedTx.hash);

    console.log('\n✅ Escrow setup complete!');
    console.log(`Module deployed at: ${MODULE_ADDRESS}`);
    console.log(`Resolver whitelisted: ${RESOLVER_ADDRESS}`);

  } catch (error) {
    console.error('Error:', error);
    if (error.transaction?.vm_status) {
      console.error('VM Status:', error.transaction.vm_status);
    }
  }
}

main().catch(console.error);