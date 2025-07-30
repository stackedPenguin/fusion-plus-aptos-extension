import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import Web3Modal from 'web3modal';
import './App.css';
import SwapInterface from './components/SwapInterface';
import TransactionPanel from './components/TransactionPanel';
import { OrderService } from './services/OrderService';

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
          const response = await fetch(
            'https://fullnode.testnet.aptoslabs.com/v1/accounts/' + aptosAccount.address + '/resource/0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
          );
          if (response.ok) {
            const data = await response.json();
            const balance = data.data.coin.value;
            setAptosBalance((parseInt(balance) / 100000000).toFixed(4));
          }
        } catch (error) {
          console.error('Failed to get APT balance:', error);
        }
      };
      updateBalance();
      const interval = setInterval(updateBalance, 10000);
      return () => clearInterval(interval);
    } else {
      setAptosBalance('0');
    }
  }, [aptosAccount]);

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

  const disconnectEthereum = async () => {
    await web3Modal.clearCachedProvider();
    setEthAccount(null);
    setEthSigner(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>Fusion+</h1>
            <span className="beta-badge">BETA</span>
          </div>
          
          <div className="wallet-section">
            <div className={`wallet-card ${ethAccount ? 'connected' : ''}`}>
              <div className="wallet-icon">Ξ</div>
              <div>
                <h3>Ethereum</h3>
                {ethAccount ? (
                  <>
                    <div className="wallet-address">
                      {ethAccount.slice(0, 6)}...{ethAccount.slice(-4)}
                    </div>
                    <div className="balance-info">{parseFloat(ethBalance).toFixed(4)} ETH</div>
                  </>
                ) : (
                  <button onClick={connectEthereum}>Connect</button>
                )}
              </div>
            </div>

            <div className={`wallet-card ${aptosAccount ? 'connected' : ''}`}>
              <div className="wallet-icon">A</div>
              <div>
                <h3>Aptos</h3>
                {aptosAccount ? (
                  <>
                    <div className="wallet-address">
                      {aptosAccount.address.slice(0, 6)}...{aptosAccount.address.slice(-4)}
                    </div>
                    <div className="balance-info">{aptosBalance} APT</div>
                  </>
                ) : (
                  <button onClick={() => {
                    const petraWallet = wallets?.find(wallet => wallet.name === 'Petra');
                    if (petraWallet) {
                      connectAptos(petraWallet.name);
                    }
                  }}>Connect</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="main-container">
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
        
        <TransactionPanel
          ethAccount={ethAccount}
          aptosAccount={aptosAccount?.address || null}
          orderService={orderService}
        />
      </div>
    </div>
  );
}

export default App;