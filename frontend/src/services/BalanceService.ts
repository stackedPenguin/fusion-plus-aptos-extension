import { ethers } from 'ethers';
import { getAptBalance } from '../utils/aptosClient';

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
      const balance = await getAptBalance(address);
      return balance;
    } catch (error) {
      console.error('Failed to fetch Aptos balance:', error);
      return '0';
    }
  }
}