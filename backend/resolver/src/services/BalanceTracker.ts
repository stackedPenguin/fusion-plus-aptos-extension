import { ethers } from 'ethers';

export class BalanceTracker {
  private lastBalances: Map<string, bigint> = new Map();
  
  constructor(
    private provider: ethers.Provider,
    private resolverAddress: string,
    private wethAddress: string
  ) {}
  
  async trackBalanceChange(context: string, token?: string): Promise<void> {
    console.log(`\n💰 Balance tracking for: ${context}`);
    
    // Get current balances
    const ethBalance = await this.provider.getBalance(this.resolverAddress);
    const wethBalance = await this.getTokenBalance(this.wethAddress);
    
    // Get previous balances
    const prevEthBalance = this.lastBalances.get('ETH') || 0n;
    const prevWethBalance = this.lastBalances.get('WETH') || 0n;
    
    // Calculate changes
    const ethChange = ethBalance - prevEthBalance;
    const wethChange = wethBalance - prevWethBalance;
    
    console.log(`   📊 Current balances:`);
    console.log(`      - ETH: ${ethers.formatEther(ethBalance)} ETH`);
    console.log(`      - WETH: ${ethers.formatEther(wethBalance)} WETH`);
    
    if (prevEthBalance > 0n || prevWethBalance > 0n) {
      console.log(`   📈 Balance changes:`);
      if (ethChange !== 0n) {
        const changeStr = ethChange > 0n ? '+' : '';
        console.log(`      - ETH: ${changeStr}${ethers.formatEther(ethChange)} ETH`);
      }
      if (wethChange !== 0n) {
        const changeStr = wethChange > 0n ? '+' : '';
        console.log(`      - WETH: ${changeStr}${ethers.formatEther(wethChange)} WETH`);
      }
    }
    
    // Update stored balances
    this.lastBalances.set('ETH', ethBalance);
    this.lastBalances.set('WETH', wethBalance);
    
    // Warn if balances are low
    const minEth = ethers.parseEther('0.01');
    const minWeth = ethers.parseEther('0.05');
    
    if (ethBalance < minEth) {
      console.log(`   ⚠️  LOW ETH BALANCE - Need at least ${ethers.formatEther(minEth)} ETH for gas`);
    }
    if (wethBalance < minWeth) {
      console.log(`   ⚠️  LOW WETH BALANCE - Need at least ${ethers.formatEther(minWeth)} WETH for swaps`);
    }
  }
  
  private async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, abi, this.provider);
    return await contract.balanceOf(this.resolverAddress);
  }
}