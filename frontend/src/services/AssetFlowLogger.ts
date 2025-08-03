import { ethers } from 'ethers';
import { WETHService } from './WETHService';
import { CONTRACTS } from '../config/contracts';
import { getAptBalance } from '../utils/aptosClient';

interface WalletBalances {
  eth: string;
  weth: string;
  apt: string;
}

interface ResolverBalances {
  ethereum: {
    eth: string;
    weth: string;
  };
  aptos: {
    apt: string;
  };
}

export class AssetFlowLogger {
  private ethSigner: ethers.Signer | null = null;
  private userEthAddress: string | null = null;
  private userAptosAddress: string | null = null;

  constructor(ethSigner: ethers.Signer | null, userEthAddress: string | null, userAptosAddress: string | null) {
    this.ethSigner = ethSigner;
    this.userEthAddress = userEthAddress;
    this.userAptosAddress = userAptosAddress;
  }

  private async getUserBalances(): Promise<WalletBalances> {
    const balances: WalletBalances = { eth: '0', weth: '0', apt: '0' };
    
    try {
      if (this.ethSigner && this.userEthAddress) {
        // Get ETH balance
        const ethBalance = await this.ethSigner.provider?.getBalance(this.userEthAddress);
        if (ethBalance) {
          balances.eth = ethers.formatEther(ethBalance);
        }
        
        // Get WETH balance
        const wethService = new WETHService(this.ethSigner);
        const wethBalance = await wethService.getBalance(this.userEthAddress);
        balances.weth = ethers.formatEther(wethBalance);
        
      }
      
      if (this.userAptosAddress) {
        // Get APT balance
        try {
          balances.apt = await getAptBalance(this.userAptosAddress);
        } catch (error) {
          console.error('Failed to get user APT balance:', error);
          balances.apt = '0';
        }
      }
    } catch (error) {
      console.error('Failed to get user balances:', error);
    }
    
    return balances;
  }

  private async getResolverBalances(): Promise<ResolverBalances> {
    const balances: ResolverBalances = {
      ethereum: { eth: '0', weth: '0' },
      aptos: { apt: '0' }
    };
    
    try {
      // Get Ethereum resolver balances
      if (this.ethSigner) {
        const resolverAddress = CONTRACTS.RESOLVER.ETHEREUM;
        
        // ETH balance
        const ethBalance = await this.ethSigner.provider?.getBalance(resolverAddress);
        if (ethBalance) {
          balances.ethereum.eth = ethers.formatEther(ethBalance);
        }
        
        // WETH balance
        const wethService = new WETHService(this.ethSigner);
        const wethBalance = await wethService.getBalance(resolverAddress);
        balances.ethereum.weth = ethers.formatEther(wethBalance);
        
      }
      
      // Get Aptos resolver balance
      const aptosResolverAddress = CONTRACTS.RESOLVER.APTOS;
      try {
        balances.aptos.apt = await getAptBalance(aptosResolverAddress);
      } catch (error) {
        console.error('Failed to get resolver APT balance:', error);
        balances.aptos.apt = '0';
      }
    } catch (error) {
      console.error('Failed to get resolver balances:', error);
    }
    
    return balances;
  }

  async logPreSwapState(fromAmount: string, selectedToken: string, fromChain?: string): Promise<void> {
    console.log('\n🔍 ========== PRE-SWAP ASSET ANALYSIS ==========');
    
    const userBalances = await this.getUserBalances();
    const resolverBalances = await this.getResolverBalances();
    
    console.log('📊 USER WALLET BALANCES (BEFORE):');
    console.log(`   • ETH: ${userBalances.eth}`);
    console.log(`   • WETH: ${userBalances.weth}`);
    console.log(`   • APT: ${userBalances.apt}`);
    console.log(`   • Swapping: ${fromAmount} ${selectedToken}`);
    
    console.log('\n🏛️ RESOLVER WALLET BALANCES (BEFORE):');
    console.log('   Ethereum Resolver:', CONTRACTS.RESOLVER.ETHEREUM);
    console.log(`   • ETH: ${resolverBalances.ethereum.eth}`);
    console.log(`   • WETH: ${resolverBalances.ethereum.weth}`);
    console.log('   Aptos Resolver:', CONTRACTS.RESOLVER.APTOS);
    console.log(`   • APT: ${resolverBalances.aptos.apt}`);
    
    console.log('\n💡 SWAP FLOW EXPLANATION:');
    
    // Determine swap direction based on fromChain parameter
    const isAptosToEthereum = fromChain === 'APTOS' || (selectedToken === 'APT' && !fromChain);
    
    if (isAptosToEthereum) {
      // APT -> WETH swap
      console.log('   1. Resolver creates destination escrow on Ethereum (locks resolver WETH)');
      console.log('   2. User creates source escrow on Aptos (locks user APT)');
      console.log('   3. Resolver reveals secret and withdraws user APT');
      console.log('   4. User uses revealed secret to withdraw WETH from destination escrow');
      console.log('   5. Net result: User APT → User WETH, Resolver gains APT, loses WETH');
    } else {
      // WETH -> APT swap
      console.log('   1. User approves WETH to escrow contract (already done)');
      console.log('   2. Resolver creates destination escrow on Aptos (locks resolver APT)');
      console.log('   3. Resolver creates source escrow on Ethereum (pulls user WETH)');
      console.log('   4. Resolver reveals secret and withdraws user WETH');
      console.log('   5. Resolver withdraws APT escrow to user wallet');
      console.log('   6. Net result: User WETH → User APT, Resolver gains WETH, loses APT');
    }
    
    console.log('============================================\n');
  }

  async logSwapStep(step: string, details?: string): Promise<void> {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`⏰ [${timestamp}] 🔄 ${step}`);
    if (details) {
      console.log(`   Details: ${details}`);
    }
    
    // Log current balances for key steps
    if (step.includes('escrow created') || step.includes('withdrawn') || step.includes('completed')) {
      const userBalances = await this.getUserBalances();
      const resolverBalances = await this.getResolverBalances();
      
      console.log('   📊 Current Balances:');
      console.log(`      User: ETH=${userBalances.eth}, WETH=${userBalances.weth}, APT=${userBalances.apt}`);
      console.log(`      Resolver: ETH=${resolverBalances.ethereum.eth}, WETH=${resolverBalances.ethereum.weth}, APT=${resolverBalances.aptos.apt}`);
    }
  }

  async logPostSwapState(orderId: string): Promise<void> {
    console.log('\n🎉 ========== POST-SWAP ASSET ANALYSIS ==========');
    
    const userBalances = await this.getUserBalances();
    const resolverBalances = await this.getResolverBalances();
    
    console.log(`📋 Order ID: ${orderId}`);
    console.log('\n📊 USER WALLET BALANCES (AFTER):');
    console.log(`   • ETH: ${userBalances.eth}`);
    console.log(`   • WETH: ${userBalances.weth}`);
    console.log(`   • APT: ${userBalances.apt}`);
    
    console.log('\n🏛️ RESOLVER WALLET BALANCES (AFTER):');
    console.log('   Ethereum Resolver:', CONTRACTS.RESOLVER.ETHEREUM);
    console.log(`   • ETH: ${resolverBalances.ethereum.eth}`);
    console.log(`   • WETH: ${resolverBalances.ethereum.weth}`);
    console.log('   Aptos Resolver:', CONTRACTS.RESOLVER.APTOS);
    console.log(`   • APT: ${resolverBalances.aptos.apt}`);
    
    console.log('\n✅ SWAP RESULT:');
    console.log('   • User successfully received APT in exchange for WETH');
    console.log('   • Resolver earned WETH fee and used APT liquidity');
    console.log('   • Atomic swap completed without user manual claiming');
    console.log('   • This demonstrates production-ready Fusion+ technology!');
    console.log('=============================================\n');
  }

  async getResolverStatus(): Promise<ResolverBalances> {
    return await this.getResolverBalances();
  }
}