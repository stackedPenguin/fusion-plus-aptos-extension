const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

async function main() {
  // Connect to testnet
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);

  // Load deployer account - use the funded account
  const privateKeyHex = '6f96d196c83b19ed4d051edf71ebb4782443c429ef82ae73cb7a9eb08e339c59';
  const privateKey = new Ed25519PrivateKey(privateKeyHex);
  const account = Account.fromPrivateKey({ privateKey });

  console.log('Deployer address:', account.accountAddress.toString());

  const MODULE_ADDRESS = '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca';
  const RESOLVER_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';

  try {
    // Initialize escrow_v2
    console.log('\nInitializing escrow_v2...');
    const initTx = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::escrow_v2::initialize`,
        typeArguments: [],
        functionArguments: []
      }
    });

    const initCommittedTx = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction: initTx
    });

    await aptos.waitForTransaction({ transactionHash: initCommittedTx.hash });
    console.log('✅ Escrow V2 initialized:', initCommittedTx.hash);

    // Add resolver to whitelist
    console.log('\nAdding resolver to whitelist...');
    const addResolverTx = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::escrow_v2::add_authorized_resolver`,
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

    console.log('\n✅ Escrow V2 setup complete!');
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