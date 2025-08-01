/**
 * Detects the type of Aptos wallet connected
 */
export function detectWalletType(): string | null {
  const aptosWindow = window as any;
  
  console.log('[Wallet Detection] Window state:', {
    hasAptos: !!aptosWindow.aptos,
    hasPetra: !!aptosWindow.petra,
    hasMartian: !!aptosWindow.martian,
    hasPontem: !!aptosWindow.pontem,
    aptosProperties: aptosWindow.aptos ? {
      isPetra: aptosWindow.aptos.isPetra,
      isMartian: aptosWindow.aptos.isMartian,
      isPontem: aptosWindow.aptos.isPontem,
      name: aptosWindow.aptos.name
    } : null
  });
  
  // Check direct window properties first
  if (aptosWindow.petra) {
    console.log('[Wallet Detection] Found Petra via window.petra');
    return 'petra';
  }
  
  if (aptosWindow.martian || aptosWindow.__martianConnected) {
    console.log('[Wallet Detection] Found Martian via window.martian or direct connection');
    return 'martian';
  }
  
  if (aptosWindow.pontem) {
    console.log('[Wallet Detection] Found Pontem via window.pontem');
    return 'pontem';
  }
  
  // Then check aptos object
  if (!aptosWindow.aptos) {
    console.log('[Wallet Detection] No aptos object found');
    return null;
  }
  
  // Check for Petra
  if (aptosWindow.aptos.isPetra) {
    console.log('[Wallet Detection] Found Petra via aptos.isPetra');
    return 'petra';
  }
  
  // Check for Martian
  if (aptosWindow.aptos.isMartian) {
    console.log('[Wallet Detection] Found Martian via aptos.isMartian');
    return 'martian';
  }
  
  // Check for Pontem
  if (aptosWindow.aptos.isPontem) {
    console.log('[Wallet Detection] Found Pontem via aptos.isPontem');
    return 'pontem';
  }
  
  // Check for Fewcha
  if (aptosWindow.aptos.isFewcha || aptosWindow.fewcha) {
    console.log('[Wallet Detection] Found Fewcha');
    return 'fewcha';
  }
  
  // Check for Rise
  if (aptosWindow.aptos.isRise || aptosWindow.rise) {
    console.log('[Wallet Detection] Found Rise');
    return 'rise';
  }
  
  // Check for MSafe
  if (aptosWindow.aptos.isMSafe || aptosWindow.msafe) {
    console.log('[Wallet Detection] Found MSafe');
    return 'msafe';
  }
  
  // Check for Trust Wallet
  if (aptosWindow.aptos.isTrust || aptosWindow.trustwallet) {
    console.log('[Wallet Detection] Found Trust Wallet');
    return 'trustwallet';
  }
  
  // Check name property
  if (aptosWindow.aptos.name) {
    console.log(`[Wallet Detection] Found wallet via name: ${aptosWindow.aptos.name}`);
    return aptosWindow.aptos.name.toLowerCase();
  }
  
  // Generic wallet
  console.log('[Wallet Detection] Unknown wallet type');
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