import { Aptos, AptosConfig, ClientConfig, Network } from "@aptos-labs/ts-sdk";

// Create a singleton Aptos client with API key
const APTOS_API_KEY = "aptoslabs_TeaoYUA6URj_GUvGWfnqhhZfwRGzbanbM2MwrWMH2jGej";

const clientConfig: ClientConfig = {
  API_KEY: APTOS_API_KEY
};

const config = new AptosConfig({
  fullnode: "https://fullnode.testnet.aptoslabs.com/v1",
  network: Network.TESTNET,
  clientConfig
});

export const aptosClient = new Aptos(config);

// Helper function to get APT balance
export async function getAptBalance(address: string): Promise<string> {
  try {
    const response = await aptosClient.view({
      payload: {
        function: '0x1::coin::balance',
        typeArguments: ['0x1::aptos_coin::AptosCoin'],
        functionArguments: [address]
      }
    });
    
    if (response && response[0]) {
      return (parseInt(response[0] as string) / 100000000).toFixed(6);
    }
    return '0';
  } catch (error: any) {
    if (error.status === 429) {
      throw new Error('Rate limited');
    }
    console.error('Failed to fetch APT balance:', error);
    throw error;
  }
}