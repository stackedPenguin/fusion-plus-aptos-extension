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
    if (aptosAccount?.address) {
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
              arguments: [aptosAccount.address]
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
  }, [aptosAccount]);

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
              aptosAccount={aptosAccount?.address || null}
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

            <div className={`wallet-card ${aptosAccount ? 'connected' : ''}`}>
              <div className="wallet-icon">
                <img src="/petra.png" alt="Aptos" />
              </div>
              <div className="wallet-content">
                <h3>Aptos</h3>
                {aptosAccount ? (
                  <>
                    <div className="wallet-info">
                      <div className="wallet-address">
                        {aptosAccount.address.slice(0, 6)}...{aptosAccount.address.slice(-4)}
                      </div>
                      <div className="balance-info">{aptosBalance} APT</div>
                    </div>
                    <button className="disconnect-btn" onClick={disconnectAptos}>Disconnect</button>
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
                          {wallets.map((wallet) => (
                            <option key={wallet.name} value={wallet.name}>
                              {wallet.name}
                            </option>
                          ))}
                        </select>
                        <button 
                          onClick={() => {
                            if (selectedWallet) {
                              try {
                                const wallet = wallets.find(w => w.name === selectedWallet);
                                if (wallet) {
                                  connectAptos(wallet.name);
                                }
                              } catch (error: any) {
                                console.error('Failed to connect wallet:', error);
                                alert(`Failed to connect ${selectedWallet}: ${error.message || 'Unknown error'}`);
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