const { AptosClient } = require('aptos');

async function checkPartialFillInit() {
  try {
    const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
    const moduleAddress = '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8';
    
    // Check if PartialFillRegistry resource exists
    try {
      const resource = await client.getAccountResource(
        moduleAddress,
        `${moduleAddress}::fusion_plus_partial_fill::PartialFillRegistry`
      );
      console.log('PartialFillRegistry exists:', resource);
    } catch (error) {
      console.log('PartialFillRegistry not found - module needs initialization');
    }
    
    // Check if EventStore resource exists
    try {
      const resource = await client.getAccountResource(
        moduleAddress,
        `${moduleAddress}::fusion_plus_partial_fill::EventStore`
      );
      console.log('EventStore exists:', resource);
    } catch (error) {
      console.log('EventStore not found - module needs initialization');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkPartialFillInit();