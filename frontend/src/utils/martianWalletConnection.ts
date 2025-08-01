/**
 * Martian Wallet connection utilities
 */

export interface MartianAccount {
  address: string;
  publicKey: string;
}

export class MartianWalletConnection {
  /**
   * Check if Martian wallet is installed
   */
  static isInstalled(): boolean {
    return typeof (window as any).martian !== 'undefined';
  }

  /**
   * Connect to Martian wallet directly
   */
  static async connect(): Promise<MartianAccount> {
    const martian = (window as any).martian;
    
    if (!martian) {
      throw new Error('Martian Wallet extension is not installed. Please install it from Chrome Web Store.');
    }

    try {
      // Connect to Martian wallet
      console.log('[Martian] Attempting to connect...');
      const response = await martian.connect();
      
      if (response.status !== 200) {
        throw new Error(`Connection failed with status: ${response.status}`);
      }
      
      console.log('[Martian] Connected successfully');
      
      // Get account info
      const account = await martian.account();
      console.log('[Martian] Account info:', account);
      
      return account;
    } catch (error: any) {
      console.error('[Martian] Connection error:', error);
      
      // Provide helpful error messages
      if (error.message?.includes('User rejected')) {
        throw new Error('Connection rejected by user');
      } else if (error.message?.includes('locked')) {
        throw new Error('Martian wallet is locked. Please unlock it and try again.');
      } else {
        throw new Error(`Failed to connect to Martian wallet: ${error.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Check if already connected
   */
  static async isConnected(): Promise<boolean> {
    const martian = (window as any).martian;
    
    if (!martian) {
      return false;
    }

    try {
      const account = await martian.account();
      return !!account?.address;
    } catch {
      return false;
    }
  }

  /**
   * Disconnect from Martian wallet
   */
  static async disconnect(): Promise<void> {
    const martian = (window as any).martian;
    
    if (!martian || !martian.disconnect) {
      return;
    }

    try {
      await martian.disconnect();
      console.log('[Martian] Disconnected');
    } catch (error) {
      console.error('[Martian] Disconnect error:', error);
    }
  }

  /**
   * Sign transaction for multi-agent flow
   */
  static async signTransaction(transaction: any): Promise<any> {
    const martian = (window as any).martian;
    
    if (!martian) {
      throw new Error('Martian wallet not available');
    }

    try {
      console.log('[Martian] Signing transaction:', transaction);
      const signedTx = await martian.signTransaction(transaction);
      console.log('[Martian] Transaction signed successfully');
      return signedTx;
    } catch (error: any) {
      console.error('[Martian] Transaction signing error:', error);
      throw new Error(`Failed to sign transaction: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get network info
   */
  static async getNetwork(): Promise<string> {
    const martian = (window as any).martian;
    
    if (!martian || !martian.network) {
      throw new Error('Martian wallet not available');
    }

    try {
      const network = await martian.network();
      return network;
    } catch (error) {
      console.error('[Martian] Failed to get network:', error);
      return 'unknown';
    }
  }
}

// Add event listeners for Martian wallet
if (typeof window !== 'undefined') {
  const martian = (window as any).martian;
  
  if (martian && martian.onAccountChange) {
    martian.onAccountChange((account: MartianAccount | null) => {
      console.log('[Martian] Account changed:', account);
      // You can dispatch events or update state here
      window.dispatchEvent(new CustomEvent('martian:accountChanged', { detail: account }));
    });
  }
  
  if (martian && martian.onNetworkChange) {
    martian.onNetworkChange((network: string) => {
      console.log('[Martian] Network changed:', network);
      window.dispatchEvent(new CustomEvent('martian:networkChanged', { detail: network }));
    });
  }
}