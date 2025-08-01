import React, { useState } from 'react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import './WalletTester.css';

interface WalletTestResult {
  name: string;
  connected: boolean;
  address: string;
  capabilities: {
    signMessage: boolean;
    signTransaction: boolean;
    signTransactionWithPayload: boolean;
    sponsoredTransaction: boolean;
    multiAgentTransaction: boolean;
    error?: string;
  };
}

export const WalletTester: React.FC = () => {
  const [results, setResults] = useState<WalletTestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [currentWalletResult, setCurrentWalletResult] = useState<WalletTestResult | null>(null);
  const { account, wallet, signTransaction, connected } = useWallet();
  
  const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));

  const testWallet = async (walletName: string): Promise<WalletTestResult> => {
    const result: WalletTestResult = {
      name: walletName,
      connected: false,
      address: '',
      capabilities: {
        signMessage: false,
        signTransaction: false,
        signTransactionWithPayload: false,
        sponsoredTransaction: false,
        multiAgentTransaction: false
      }
    };

    try {
      const walletWindow = window as any;
      const wallet = walletWindow[walletName] || walletWindow.aptos;
      
      if (!wallet) {
        result.capabilities.error = 'Wallet not found';
        return result;
      }

      // Connect wallet
      try {
        console.log(`Connecting to ${walletName}...`);
        await wallet.connect();
        result.connected = true;
        const account = await wallet.account();
        result.address = account.address || account;
        console.log(`Connected to ${walletName}: ${result.address}`);
      } catch (e: any) {
        console.error(`Failed to connect ${walletName}:`, e);
        result.capabilities.error = `Connection failed: ${e.message}`;
        return result;
      }

      // Skip signMessage test to avoid popups during bulk testing
      console.log(`Skipping signMessage test for ${walletName} to avoid popups`);

      // Test regular transaction signing
      try {
        const tx = await aptos.transaction.build.simple({
          sender: result.address,
          data: {
            function: '0x1::aptos_account::transfer',
            functionArguments: [result.address, 1]
          }
        });
        
        // Try different signing methods
        if (wallet.signTransaction) {
          await wallet.signTransaction(tx);
          result.capabilities.signTransaction = true;
        } else if (wallet.signAndSubmitTransaction) {
          // Some wallets only have signAndSubmitTransaction
          console.log(`${walletName} doesn't have signTransaction, has signAndSubmitTransaction`);
          result.capabilities.error = 'Only supports signAndSubmitTransaction';
        }
      } catch (e: any) {
        console.log(`${walletName} signTransaction failed:`, e.message);
      }

      // Test sponsored transaction (withFeePayer)
      try {
        const sponsoredTx = await aptos.transaction.build.simple({
          sender: result.address,
          withFeePayer: true,
          data: {
            function: '0x1::aptos_account::transfer',
            functionArguments: [result.address, 1]
          }
        });
        
        if (wallet.signTransaction) {
          // Try to sign sponsored transaction
          await wallet.signTransaction(sponsoredTx);
          result.capabilities.sponsoredTransaction = true;
          console.log(`✅ ${walletName} supports sponsored transactions!`);
        }
      } catch (e: any) {
        console.log(`${walletName} sponsored tx failed:`, e.message);
        if (e.message.includes('blank') || e.message.includes('popup')) {
          result.capabilities.error = 'Blank popup - no support';
        }
      }

      // Test multi-agent transaction
      try {
        if (wallet.signMultiAgentTransaction) {
          result.capabilities.multiAgentTransaction = true;
        }
      } catch (e) {
        console.log(`${walletName} multi-agent check failed:`, e);
      }

      // Test signTransaction with payload object
      try {
        if (wallet.signTransaction) {
          const payload = {
            function: '0x1::aptos_account::transfer',
            type_arguments: [],
            arguments: [result.address, '1']
          };
          
          // Some wallets prefer payload format
          await wallet.signTransaction({ payload });
          result.capabilities.signTransactionWithPayload = true;
        }
      } catch (e) {
        console.log(`${walletName} payload signing failed:`, e);
      }

    } catch (error: any) {
      result.capabilities.error = error.message;
    }

    return result;
  };

  const testAllWallets = async () => {
    console.log('Starting wallet tests...');
    setTesting(true);
    setResults([]);
    
    const walletNames = [
      'petra',
      'martian', 
      'pontem',
      'fewcha',
      'rise',
      'nightly',
      'msafe',
      'blocto',
      'spacecy',
      'okx',
      'bitget',
      'trustwallet',
      'aptos' // Generic fallback
    ];

    const testResults: WalletTestResult[] = [];
    
    try {
      for (const walletName of walletNames) {
        console.log(`\nTesting ${walletName}...`);
        const result = await testWallet(walletName);
        testResults.push(result);
        setResults([...testResults]);
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error during wallet testing:', error);
    }
    
    setTesting(false);
    
    // Find best wallet
    const bestWallet = testResults
      .filter(r => r.connected && r.capabilities.sponsoredTransaction)
      .sort((a, b) => {
        // Prioritize wallets with more capabilities
        const scoreA = Object.values(a.capabilities).filter(v => v === true).length;
        const scoreB = Object.values(b.capabilities).filter(v => v === true).length;
        return scoreB - scoreA;
      })[0];
    
    if (bestWallet) {
      console.log(`\n🎉 Best wallet for sponsored transactions: ${bestWallet.name}`);
    } else {
      console.log('\n❌ No wallets found that support sponsored transactions');
    }
  };

  const testCurrentWallet = async () => {
    if (!account || !wallet) {
      alert('Please connect a wallet first');
      return;
    }

    console.log('Testing current wallet:', wallet.name);
    console.log('Wallet object:', wallet);
    console.log('SignTransaction function available?', !!signTransaction);
    console.log('Account:', account);
    setTesting(true);
    setCurrentWalletResult(null);

    const result: WalletTestResult = {
      name: wallet.name || 'Unknown',
      connected: true,
      address: account.address,
      capabilities: {
        signMessage: false,
        signTransaction: false,
        signTransactionWithPayload: false,
        sponsoredTransaction: false,
        multiAgentTransaction: false
      }
    };

    try {
      // First test if we can sign a regular transaction
      console.log('Testing regular transaction signing...');
      try {
        const regularTx = await aptos.transaction.build.simple({
          sender: account.address,
          data: {
            function: '0x1::aptos_account::transfer',
            functionArguments: [account.address, 1]
          }
        });
        
        console.log('Built regular transaction:', regularTx);
        
        if (signTransaction) {
          console.log('Using signTransaction from useWallet hook...');
          try {
            const signedRegular = await signTransaction(regularTx);
            console.log('✅ Successfully signed regular transaction:', signedRegular);
            result.capabilities.signTransaction = true;
          } catch (signError: any) {
            console.error('SignTransaction error:', signError);
            throw signError;
          }
        } else {
          console.error('signTransaction function not available from useWallet');
          // Check if wallet only supports signAndSubmitTransaction
          const signAndSubmitTransaction = (wallet as any).signAndSubmitTransaction;
          if (signAndSubmitTransaction) {
            console.log('Wallet only supports signAndSubmitTransaction, not signTransaction');
            throw new Error('Wallet only supports signAndSubmitTransaction');
          }
          
          // Try accessing the wallet directly from window
          const windowWallet = (window as any)[wallet.name.toLowerCase()] || (window as any).aptos;
          if (windowWallet && typeof windowWallet.signTransaction === 'function') {
            console.log('Trying window wallet signTransaction...');
            const signedRegular = await windowWallet.signTransaction(regularTx);
            console.log('✅ Successfully signed with window wallet:', signedRegular);
            result.capabilities.signTransaction = true;
          } else {
            throw new Error('No sign transaction method available');
          }
        }
      } catch (e: any) {
        console.error('Failed regular transaction test:', e);
        result.capabilities.error = `Regular tx failed: ${e.message || e}`;
      }

      // Now test sponsored transaction
      console.log('\nTesting sponsored transaction...');
      try {
        const sponsoredTx = await aptos.transaction.build.simple({
          sender: account.address,
          withFeePayer: true,
          data: {
            function: '0x1::aptos_account::transfer',
            functionArguments: [account.address, 1]
          }
        });

        console.log('Built sponsored transaction:', sponsoredTx);
        console.log('Transaction has fee payer field:', 'feePayerAddress' in sponsoredTx);
        console.log('Transaction type:', typeof sponsoredTx.rawTransaction);
        
        if (signTransaction) {
          console.log('Attempting to sign sponsored transaction with useWallet...');
          try {
            const signedTx = await signTransaction(sponsoredTx);
            console.log('✅ Successfully signed sponsored transaction!', signedTx);
            result.capabilities.sponsoredTransaction = true;
          } catch (sponsorError: any) {
            console.error('Sponsored tx sign error:', sponsorError);
            throw sponsorError;
          }
        } else {
          // Try window wallet
          const windowWallet = (window as any)[wallet.name.toLowerCase()] || (window as any).aptos;
          if (windowWallet && typeof windowWallet.signTransaction === 'function') {
            console.log('Trying sponsored tx with window wallet...');
            const signedTx = await windowWallet.signTransaction(sponsoredTx);
            console.log('✅ Successfully signed sponsored tx with window wallet!', signedTx);
            result.capabilities.sponsoredTransaction = true;
          }
        }
      } catch (e: any) {
        console.error('Failed sponsored transaction test:', e);
        if (!result.capabilities.error) {
          result.capabilities.error = `Sponsored tx failed: ${e.message || e}`;
        }
      }

    } catch (error: any) {
      console.error('Error testing wallet:', error);
      result.capabilities.error = error.message;
    }

    setCurrentWalletResult(result);
    setTesting(false);
  };

  const manualTestSponsoredTx = async () => {
    if (!account || !wallet) {
      alert('Please connect a wallet first');
      return;
    }

    try {
      console.log('Manual test: Building sponsored transaction...');
      console.log('Current wallet:', wallet.name);
      console.log('Account address:', account.address);
      
      // Build a minimal sponsored transaction
      const tx = await aptos.transaction.build.simple({
        sender: account.address,
        withFeePayer: true,
        data: {
          function: '0x1::coin::transfer',
          typeArguments: ['0x1::aptos_coin::AptosCoin'],
          functionArguments: [account.address, '1']
        }
      });

      console.log('Transaction built:', tx);
      console.log('Transaction details:', {
        sender: account.address,
        rawTxType: typeof tx.rawTransaction,
        hasFeePayerAddress: 'feePayerAddress' in tx
      });
      
      let signed;
      if (signTransaction) {
        console.log('Using signTransaction from useWallet...');
        signed = await signTransaction(tx);
      } else {
        // Try window wallet
        const windowWallet = (window as any)[wallet.name.toLowerCase()] || (window as any).aptos;
        if (windowWallet && typeof windowWallet.signTransaction === 'function') {
          console.log('Using window wallet signTransaction...');
          signed = await windowWallet.signTransaction(tx);
        } else {
          throw new Error('No signing method available');
        }
      }
      
      console.log('✅ SUCCESS! Signed sponsored transaction:', signed);
      alert('Success! This wallet supports sponsored transactions!');
      
    } catch (error: any) {
      console.error('Manual test failed:', error);
      console.error('Error stack:', error.stack);
      alert(`Failed: ${error.message || error}`);
    }
  };

  return (
    <div className="wallet-tester">
      <h2>Wallet Compatibility Tester</h2>
      <p>Test which wallets support Aptos sponsored transactions (fee payer model)</p>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => {
            console.log('Test current wallet clicked');
            testCurrentWallet();
          }} 
          disabled={testing || !account}
          className="test-button"
          style={{ flex: 1 }}
        >
          {testing ? 'Testing...' : 'Test Current Wallet'}
        </button>
        
        <button 
          onClick={() => {
            console.log('Test all wallets clicked');
            testAllWallets();
          }} 
          disabled={testing}
          className="test-button"
          style={{ flex: 1 }}
        >
          Test All
        </button>

        <button 
          onClick={manualTestSponsoredTx} 
          disabled={!account}
          className="test-button"
          style={{ flex: 1, background: '#ff6b6b' }}
        >
          Manual Test
        </button>
      </div>
      
      {currentWalletResult && (
        <div className="current-wallet-result" style={{ marginBottom: '20px' }}>
          <h3>Current Wallet Test Result</h3>
          <div className={`wallet-result ${currentWalletResult.capabilities.sponsoredTransaction ? 'supported' : ''}`}>
            <h4>{currentWalletResult.name}</h4>
            <p className="address">Address: {currentWalletResult.address.slice(0, 8)}...</p>
            <ul className="capabilities">
              <li className={currentWalletResult.capabilities.signTransaction ? 'yes' : 'no'}>
                Sign Transaction: {currentWalletResult.capabilities.signTransaction ? '✅' : '❌'}
              </li>
              <li className={currentWalletResult.capabilities.sponsoredTransaction ? 'yes' : 'no'}>
                <strong>Sponsored Transaction: {currentWalletResult.capabilities.sponsoredTransaction ? '✅' : '❌'}</strong>
              </li>
              {currentWalletResult.capabilities.error && (
                <li className="error">Error: {currentWalletResult.capabilities.error}</li>
              )}
            </ul>
          </div>
        </div>
      )}
      
      <div className="results">
        {results.map((result, index) => (
          <div key={index} className={`wallet-result ${result.capabilities.sponsoredTransaction ? 'supported' : ''}`}>
            <h3>{result.name}</h3>
            {result.connected ? (
              <>
                <p className="address">Address: {result.address.slice(0, 8)}...</p>
                <ul className="capabilities">
                  <li className={result.capabilities.signMessage ? 'yes' : 'no'}>
                    Sign Message: {result.capabilities.signMessage ? '✅' : '❌'}
                  </li>
                  <li className={result.capabilities.signTransaction ? 'yes' : 'no'}>
                    Sign Transaction: {result.capabilities.signTransaction ? '✅' : '❌'}
                  </li>
                  <li className={result.capabilities.sponsoredTransaction ? 'yes' : 'no'}>
                    <strong>Sponsored Transaction: {result.capabilities.sponsoredTransaction ? '✅' : '❌'}</strong>
                  </li>
                  <li className={result.capabilities.multiAgentTransaction ? 'yes' : 'no'}>
                    Multi-Agent: {result.capabilities.multiAgentTransaction ? '✅' : '❌'}
                  </li>
                  {result.capabilities.error && (
                    <li className="error">Error: {result.capabilities.error}</li>
                  )}
                </ul>
              </>
            ) : (
              <p className="error">{result.capabilities.error || 'Not installed or not connected'}</p>
            )}
          </div>
        ))}
      </div>
      
      {results.length > 0 && (
        <div className="recommendations">
          <h3>Recommendations:</h3>
          {results.some(r => r.capabilities.sponsoredTransaction) ? (
            <ul>
              {results
                .filter(r => r.capabilities.sponsoredTransaction)
                .map(r => (
                  <li key={r.name}>
                    <strong>{r.name}</strong> - Supports sponsored transactions! ✅
                  </li>
                ))}
            </ul>
          ) : (
            <p>No wallets found that support sponsored transactions. Consider using:</p>
          )}
          <ul>
            <li>Aptos Keyless accounts (no wallet needed)</li>
            <li>Custom signing with session keys</li>
            <li>Message signing + on-chain verification</li>
          </ul>
        </div>
      )}
    </div>
  );
};