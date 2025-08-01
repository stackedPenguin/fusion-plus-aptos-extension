import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import Web3Modal from 'web3modal';
import './App.css';
import SwapInterface from './components/SwapInterface';
import TransactionPanel from './components/TransactionPanel';
import { OrderService } from './services/OrderService';
import DarkVeil from './components/DarkVeil';
import { WalletTester } from './components/WalletTester';
import { MartianWalletConnection } from './utils/martianWalletConnection';

const web3Modal = new Web3Modal({
  network: 'sepolia',
  cacheProvider: true,
  providerOptions: {}
});

function App() {
  const [ethAccount, setEthAccount] = useState<string | null>(null);
  const [ethSigner, setEthSigner] = useState<ethers.Signer | null>(null);
  const [ethBalance, setEthBalance] = useState<string>('0');
  const { account: aptosAccount, connect: connectAptos, disconnect: disconnectAptos, wallets } = useWallet();
  const [aptosBalance, setAptosBalance] = useState<string>('0');
  const [orderService] = useState(() => new OrderService());
  const [showWalletTester, setShowWalletTester] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [martianConnected, setMartianConnected] = useState(false);

  // Listen for Martian connection events
  useEffect(() => {
    const handleMartianConnected = (event: any) => {
      console.log('[App] Martian connected event received:', event.detail);
      setMartianConnected(true);
      // Update Aptos balance if we have the account
      if (event.detail?.address) {
        // Trigger balance update
        setAptosBalance('Loading...');
      }
    };

    window.addEventListener('martian:connected', handleMartianConnected);
    
    // Check if already connected
    if ((window as any).__martianConnected) {
      setMartianConnected(true);
    }

    return () => {
      window.removeEventListener('martian:connected', handleMartianConnected);
    };
  }, []);

  // Update Ethereum balance
  useEffect(() => {
    if (ethSigner) {
      const updateBalance = async () => {
        try {
          const address = await ethSigner.getAddress();
          const balance = await ethSigner.provider?.getBalance(address);
          if (balance) {
            setEthBalance(ethers.formatEther(balance));
          }
        } catch (error) {
          console.error('Failed to get ETH balance:', error);
        }
      };
      updateBalance();
      const interval = setInterval(updateBalance, 10000);
      return () => clearInterval(interval);
    } else {
      setEthBalance('0');
    }
  }, [ethSigner]);

  // Update Aptos balance
  useEffect(() => {
    // Check for wallet adapter account or Martian direct connection
    const accountAddress = aptosAccount?.address || (window as any).__martianAccount?.address;
    
    if (accountAddress) {
      const updateBalance = async () => {
        try {
          const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              function: '0x1::coin::balance',
              type_arguments: ['0x1::aptos_coin::AptosCoin'],
              arguments: [accountAddress]
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            const balance = result[0] || '0';
            setAptosBalance((Number(balance) / 100000000).toFixed(6));
          } else {
            console.error('Failed to fetch balance:', await response.text());
            setAptosBalance('0');
          }
        } catch (error) {
          console.error('Failed to get APT balance:', error);
          setAptosBalance('0');
        }
      };
      updateBalance();
      const interval = setInterval(updateBalance, 10000);
      return () => clearInterval(interval);
    } else {
      setAptosBalance('0');
    }
  }, [aptosAccount, martianConnected]);

  // Handle balance refresh events from SwapInterface
  useEffect(() => {
    const handleRefreshBalances = () => {
      // Force update both balances
      if (ethSigner) {
        const updateEthBalance = async () => {
          try {
            const address = await ethSigner.getAddress();
            const balance = await ethSigner.provider?.getBalance(address);
            if (balance) {
              setEthBalance(ethers.formatEther(balance));
            }
          } catch (error) {
            console.error('Failed to refresh ETH balance:', error);
          }
        };
        updateEthBalance();
      }
      
      if (aptosAccount?.address) {
        const updateAptBalance = async () => {
          try {
            const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                function: '0x1::coin::balance',
                type_arguments: ['0x1::aptos_coin::AptosCoin'],
                arguments: [aptosAccount.address]
              })
            });
            
            if (response.ok) {
              const result = await response.json();
              const balance = result[0] || '0';
              setAptosBalance((Number(balance) / 100000000).toFixed(6));
            }
          } catch (error) {
            console.error('Failed to refresh APT balance:', error);
          }
        };
        updateAptBalance();
      }
    };

    window.addEventListener('refreshBalances', handleRefreshBalances);
    return () => window.removeEventListener('refreshBalances', handleRefreshBalances);
  }, [ethSigner, aptosAccount]);

  // Connect Ethereum wallet
  const connectEthereum = async () => {
    try {
      const instance = await web3Modal.connect();
      const provider = new ethers.BrowserProvider(instance);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      
      setEthSigner(signer);
      setEthAccount(address);
    } catch (error) {
      console.error('Failed to connect Ethereum wallet:', error);
    }
  };

  const disconnectEthereum = () => {
    web3Modal.clearCachedProvider();
    setEthAccount(null);
    setEthSigner(null);
  };

  return (
    <div className="App">
      <div className="app-background">
        <DarkVeil 
          hueShift={180}
          noiseIntensity={0.03}
          scanlineIntensity={0.05}
          speed={0.3}
          scanlineFrequency={0.8}
          warpAmount={0.8}
          resolutionScale={0.8}
        />
      </div>

      <div className="app-layout">
        <div className="main-content">
          <div className="logo-section">
            <h1>Fusion+ Aptos Extension</h1>
            <span className="beta-badge">BETA</span>
          </div>
          
          <div className="swap-container">
            <SwapInterface
              ethAccount={ethAccount}
              aptosAccount={aptosAccount?.address || (window as any).__martianAccount?.address || null}
              ethSigner={ethSigner}
              orderService={orderService}
              ethBalance={ethBalance}
              aptosBalance={aptosBalance}
            />
          </div>
        </div>
        
        <div className="sidebar">
          <div className="sidebar-section wallet-section">
            <h3 className="sidebar-section-title">Wallets</h3>
            
            <div className={`wallet-card ${ethAccount ? 'connected' : ''}`}>
              <div className="wallet-icon">
                <img src="/metamask-icon.png" alt="MetaMask" />
              </div>
              <div className="wallet-content">
                <h3>Ethereum</h3>
                {ethAccount ? (
                  <>
                    <div className="wallet-info">
                      <div className="wallet-address">
                        {ethAccount.slice(0, 6)}...{ethAccount.slice(-4)}
                      </div>
                      <div className="balance-info">{parseFloat(ethBalance).toFixed(4)} ETH</div>
                    </div>
                    <button className="disconnect-btn" onClick={disconnectEthereum}>Disconnect</button>
                  </>
                ) : (
                  <button onClick={connectEthereum}>Connect</button>
                )}
              </div>
            </div>

            <div className={`wallet-card ${aptosAccount || martianConnected ? 'connected' : ''}`}>
              <div className="wallet-icon">
                <img src="/petra.png" alt="Aptos" />
              </div>
              <div className="wallet-content">
                <h3>Aptos</h3>
                {aptosAccount || martianConnected ? (
                  <>
                    <div className="wallet-info">
                      <div className="wallet-address">
                        {(() => {
                          const address = aptosAccount?.address || (window as any).__martianAccount?.address;
                          return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
                        })()}
                      </div>
                      <div className="balance-info">{aptosBalance} APT</div>
                      {martianConnected && !aptosAccount && (
                        <div style={{ fontSize: '12px', color: '#4CAF50' }}>✓ Martian Connected</div>
                      )}
                    </div>
                    <button className="disconnect-btn" onClick={() => {
                      if (martianConnected && !aptosAccount) {
                        MartianWalletConnection.disconnect();
                        (window as any).__martianConnected = false;
                        (window as any).__martianAccount = null;
                        setMartianConnected(false);
                        setAptosBalance('0');
                      } else {
                        disconnectAptos();
                      }
                    }}>Disconnect</button>
                  </>
                ) : (
                  <div className="wallet-options" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {wallets && wallets.length > 0 ? (
                      <>
                        <select 
                          value={selectedWallet} 
                          onChange={(e) => setSelectedWallet(e.target.value)}
                          style={{
                            padding: '8px',
                            borderRadius: '4px',
                            backgroundColor: '#333',
                            color: '#fff',
                            border: '1px solid #555'
                          }}
                        >
                          <option value="">Select Wallet</option>
                          {/* Filter out duplicate wallets by name */}
                          {wallets
                            .filter((wallet, index, self) => 
                              index === self.findIndex(w => w.name === wallet.name)
                            )
                            .map((wallet) => (
                              <option key={wallet.name} value={wallet.name}>
                                {wallet.name}
                              </option>
                            ))}
                        </select>
                        <button 
                          onClick={() => {
                            if (selectedWallet) {
                              console.log(`[Wallet Connection] Starting connection process for: ${selectedWallet}`);
                              console.log(`[Wallet Connection] Available wallets:`, wallets.map(w => ({ 
                                name: w.name, 
                                readyState: (w as any).readyState,
                                installed: !!(window as any)[w.name.toLowerCase()]
                              })));
                              
                              const wallet = wallets.find(w => w.name === selectedWallet);
                              if (!wallet) {
                                console.error(`[Wallet Connection] Wallet ${selectedWallet} not found in wallets array`);
                                alert(`Wallet ${selectedWallet} not found`);
                                return;
                              }
                              
                              console.log(`[Wallet Connection] Found wallet:`, {
                                name: wallet.name,
                                readyState: (wallet as any).readyState,
                                url: (wallet as any).url
                              });
                              
                              // Check if wallet is installed
                              const isInstalled = (window as any)[selectedWallet.toLowerCase()] || 
                                                 (window as any).aptos?.name === selectedWallet ||
                                                 (window as any).martian;
                              
                              console.log(`[Wallet Connection] Wallet installed check:`, {
                                windowObject: !!(window as any)[selectedWallet.toLowerCase()],
                                aptosName: (window as any).aptos?.name,
                                hasMartian: !!(window as any).martian,
                                isInstalled
                              });
                              
                              if (!isInstalled && selectedWallet === 'Martian') {
                                alert('Martian wallet extension not detected. Please install it from Chrome Web Store.');
                                window.open('https://chrome.google.com/webstore/detail/martian-aptos-wallet/efbglgofoippbgcjepnhiblaibcnclgk', '_blank');
                                return;
                              }
                              
                              console.log(`[Wallet Connection] Calling connection method...`);
                              
                              // Special handling for Martian wallet
                              if (selectedWallet === 'Martian' && (window as any).martian) {
                                console.log('[Wallet Connection] Using direct Martian connection method');
                                
                                MartianWalletConnection.connect()
                                  .then(async (account) => {
                                    console.log('[Wallet Connection] Martian connected:', account);
                                    
                                    // Set a flag to indicate Martian is connected
                                    (window as any).__martianConnected = true;
                                    (window as any).__martianAccount = account;
                                    
                                    // Force update the UI by dispatching a custom event
                                    window.dispatchEvent(new CustomEvent('martian:connected', { detail: account }));
                                    
                                    // Skip wallet adapter sync for Martian - we don't need it
                                    console.log('[Wallet Connection] Martian connected successfully - skipping wallet adapter sync');
                                    
                                    // Force a small delay to ensure UI updates
                                    setTimeout(() => {
                                      console.log('[Wallet Connection] Martian wallet ready for use');
                                    }, 100);
                                  })
                                  .catch((error) => {
                                    console.error('[Wallet Connection] Martian direct connection failed:', error);
                                    alert(error.message);
                                  });
                              } else {
                                // Use standard wallet adapter for other wallets
                                try {
                                  connectAptos(wallet.name);
                                  console.log(`[Wallet Connection] Successfully connected to ${selectedWallet}`);
                                } catch (error: any) {
                                  console.error(`[Wallet Connection] Connection failed:`, {
                                    wallet: selectedWallet,
                                    error,
                                    errorMessage: error?.message,
                                    errorCode: error?.code,
                                    errorStack: error?.stack
                                  });
                                  
                                  // Provide specific error messages
                                  let errorMessage = `Failed to connect ${selectedWallet}: `;
                                  if (error.message?.includes('Network Error') || error.code === 'NETWORK_ERROR') {
                                    errorMessage += 'Network error - make sure the wallet extension is installed and unlocked';
                                  } else if (error.message?.includes('User rejected') || error.code === 4001) {
                                    errorMessage += 'Connection rejected by user';
                                  } else if (error.message?.includes('not installed')) {
                                    errorMessage += 'Wallet extension not installed';
                                  } else {
                                    errorMessage += error.message || 'Unknown error';
                                  }
                                  
                                  alert(errorMessage);
                                }
                              }
                            }
                          }}
                          disabled={!selectedWallet}
                          style={{
                            opacity: selectedWallet ? 1 : 0.5
                          }}
                        >
                          Connect
                        </button>
                      </>
                    ) : (
                      <button onClick={() => alert('No Aptos wallets detected')}>
                        No Wallets Found
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="sidebar-section transaction-section">
            <TransactionPanel
              ethAccount={ethAccount}
              aptosAccount={aptosAccount?.address || null}
              orderService={orderService}
            />
          </div>
          
          <div className="sidebar-section">
            <button 
              onClick={() => setShowWalletTester(!showWalletTester)}
              className="wallet-tester-toggle"
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '10px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              {showWalletTester ? 'Hide' : 'Show'} Wallet Tester
            </button>
            
            {showWalletTester && (
              <div style={{ 
                marginTop: '10px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                <WalletTester />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;