import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import Web3Modal from 'web3modal';
import './App.css';
import SwapInterface from './components/SwapInterface';
import { OrderService } from './services/OrderService';
import DarkVeil from './components/DarkVeil';
import ResolverStatus from './components/ResolverStatus';
import { MartianWalletConnection } from './utils/martianWalletConnection';
import { getAptBalance } from './utils/aptosClient';

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
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [martianConnected, setMartianConnected] = useState(false);
  const [dutchAuctionEnabled, setDutchAuctionEnabled] = useState<boolean>(false);
  const [activeResolvers, setActiveResolvers] = useState<string[]>([]);
  const [partialFillEnabled, setPartialFillEnabled] = useState<boolean>(false);

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
          const balance = await getAptBalance(accountAddress);
          setAptosBalance(balance);
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

  // Create a global update balances function for SwapInterface
  const updateAllBalances = async () => {
    // Update ETH balance
    if (ethSigner) {
      try {
        const address = await ethSigner.getAddress();
        const balance = await ethSigner.provider?.getBalance(address);
        if (balance) {
          setEthBalance(ethers.formatEther(balance));
        }
      } catch (error) {
        console.error('Failed to refresh ETH balance:', error);
      }
    }

    // Update APT balance
    const accountAddress = aptosAccount?.address || (window as any).__martianAccount?.address;
    if (accountAddress) {
      try {
        const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/accounts/' + accountAddress + '/resources');
        if (response.ok) {
          const resources = await response.json();
          const coinStore = resources.find((r: any) => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
          if (coinStore) {
            const balance = coinStore.data.coin.value;
            setAptosBalance((Number(balance) / 100000000).toFixed(6));
          }
        }
      } catch (error) {
        console.error('Failed to refresh APT balance:', error);
      }
    }
  };

  // Make updateAllBalances globally available
  useEffect(() => {
    (window as any).__updateBalances = updateAllBalances;
    return () => {
      delete (window as any).__updateBalances;
    };
  }, [ethSigner, aptosAccount]);

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
            const balance = await getAptBalance(aptosAccount.address);
            setAptosBalance(balance);
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

  const handleResolverToggle = (resolverId: string, enabled: boolean) => {
    setActiveResolvers(prev => {
      if (enabled) {
        return [...prev, resolverId];
      } else {
        return prev.filter(id => id !== resolverId);
      }
    });
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
          <div className="top-header">
            <div className="logo-section">
              <h1>Fusion+ Aptos Extension</h1>
              <span className="beta-badge">BETA</span>
            </div>
          </div>
          
          <div className="swap-container">
            <SwapInterface
              ethAccount={ethAccount}
              aptosAccount={aptosAccount?.address || (window as any).__martianAccount?.address || null}
              ethSigner={ethSigner}
              orderService={orderService}
              ethBalance={ethBalance}
              aptosBalance={aptosBalance}
              dutchAuctionEnabled={dutchAuctionEnabled}
              activeResolvers={activeResolvers}
              partialFillEnabled={partialFillEnabled}
            />
          </div>
        </div>
        
        <div className="right-sidebar">
              <div className="wallet-connectors">
              <div className={`wallet-connector ${ethAccount ? 'connected' : ''}`}>
                <div className="wallet-icon">
                  <img src="/metamask-icon.png" alt="MetaMask" />
                </div>
                {ethAccount ? (
                  <>
                    <div className="wallet-info">
                      <div className="wallet-address">
                        {ethAccount.slice(0, 6)}...{ethAccount.slice(-4)}
                      </div>
                      <div className="balance-info">{parseFloat(ethBalance).toFixed(4)} ETH</div>
                    </div>
                    <button className="disconnect-btn" onClick={disconnectEthereum}>×</button>
                  </>
                ) : (
                  <button className="connect-btn" onClick={connectEthereum}>Connect Ethereum</button>
                )}
              </div>

              <div className={`wallet-connector ${aptosAccount || martianConnected ? 'connected' : ''}`}>
                <div className="wallet-icon">
                  <img src="/petra.png" alt="Aptos" />
                </div>
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
                    }}>×</button>
                  </>
                ) : (
                  <button 
                    className="connect-btn"
                    onClick={() => {
                      // Connect to Petra wallet
                      const wallet = wallets?.find(w => w.name === 'Petra');
                      if (!wallet) {
                        console.error('[Wallet Connection] Petra wallet not found');
                        alert('Petra wallet not found. Please install the Petra wallet extension.');
                        return;
                      }
                      
                      console.log('[Wallet Connection] Connecting to Petra wallet');
                      setSelectedWallet('Petra');
                      
                      try {
                        connectAptos(wallet.name);
                        console.log('[Wallet Connection] Successfully initiated Petra connection');
                      } catch (error: any) {
                        console.error('[Wallet Connection] Connection failed:', error);
                        
                        let errorMessage = 'Failed to connect Petra wallet: ';
                        if (error.message?.includes('not installed')) {
                          errorMessage += 'Please install the Petra wallet extension';
                        } else {
                          errorMessage += error.message || 'Unknown error';
                        }
                        
                        alert(errorMessage);
                      }
                    }}
                  >
                    Connect Aptos
                  </button>
                )}
              </div>
              </div>
              
              <ResolverStatus 
                onResolverToggle={handleResolverToggle}
                onDutchAuctionToggle={setDutchAuctionEnabled}
                onPartialFillToggle={setPartialFillEnabled}
                dutchAuctionEnabled={dutchAuctionEnabled}
                partialFillEnabled={partialFillEnabled}
                isSwapping={false}
              />
        </div>
      </div>
    </div>
  );
}

export default App;