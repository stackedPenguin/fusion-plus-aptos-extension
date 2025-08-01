/**
 * Detects the type of Aptos wallet connected
 */
export function detectWalletType(): string | null {
  const aptosWindow = window as any;
  
  if (!aptosWindow.aptos) {
    return null;
  }
  
  // Check for Petra
  if (aptosWindow.aptos.isPetra || aptosWindow.petra) {
    return 'petra';
  }
  
  // Check for Martian
  if (aptosWindow.aptos.isMartian || aptosWindow.martian) {
    return 'martian';
  }
  
  // Check for Pontem
  if (aptosWindow.aptos.isPontem || aptosWindow.pontem) {
    return 'pontem';
  }
  
  // Check for Fewcha
  if (aptosWindow.aptos.isFewcha || aptosWindow.fewcha) {
    return 'fewcha';
  }
  
  // Check for Rise
  if (aptosWindow.aptos.isRise || aptosWindow.rise) {
    return 'rise';
  }
  
  // Check for MSafe
  if (aptosWindow.aptos.isMSafe || aptosWindow.msafe) {
    return 'msafe';
  }
  
  // Check for Trust Wallet
  if (aptosWindow.aptos.isTrust || aptosWindow.trustwallet) {
    return 'trustwallet';
  }
  
  // Generic wallet
  return 'unknown';
}

/**
 * Checks if the connected wallet supports sponsored transactions
 */
export function walletSupportsSponsoredTransactions(): boolean {
  const walletType = detectWalletType();
  
  // Known wallets that don't support sponsored transactions yet
  const unsupportedWallets = ['petra'];
  
  // Known wallets that might support sponsored transactions
  // MSafe is known to support multi-agent transactions which are similar
  const supportedWallets = ['msafe', 'rise', 'trustwallet', 'martian', 'nightly'];
  
  if (!walletType) {
    return false;
  }
  
  if (unsupportedWallets.includes(walletType)) {
    return false;
  }
  
  if (supportedWallets.includes(walletType)) {
    console.log(`${walletType} wallet detected - may support sponsored transactions`);
    return true;
  }
  
  // For unknown wallets, we can try
  return true;
}