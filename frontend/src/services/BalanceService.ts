import { ethers } from 'ethers';

export class BalanceService {
  async getEthereumBalance(address: string, provider: ethers.Provider): Promise<string> {
    try {
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Failed to fetch Ethereum balance:', error);
      return '0';
    }
  }

  async getAptosBalance(address: string): Promise<string> {
    try {
      const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          function: '0x1::coin::balance',
          type_arguments: ['0x1::aptos_coin::AptosCoin'],
          arguments: [address]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Aptos balance');
      }

      const result = await response.json();
      const balance = BigInt(result[0] || '0');
      // Aptos uses 8 decimals
      return (Number(balance) / 1e8).toFixed(6);
    } catch (error) {
      console.error('Failed to fetch Aptos balance:', error);
      return '0';
    }
  }
}