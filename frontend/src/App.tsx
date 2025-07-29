import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import Web3Modal from 'web3modal';
import './App.css';
import SwapInterface from './components/SwapInterface';
import OrderHistory from './components/OrderHistory';
import { OrderService } from './services/OrderService';

const web3Modal = new Web3Modal({
  network: 'sepolia',
  cacheProvider: true,
  providerOptions: {}
});

function App() {
  const [ethAccount, setEthAccount] = useState<string | null>(null);
  const [ethProvider, setEthProvider] = useState<ethers.Provider | null>(null);
  const [ethSigner, setEthSigner] = useState<ethers.Signer | null>(null);
  const { account: aptosAccount, connect: connectAptos, disconnect: disconnectAptos } = useWallet();
  const [orderService] = useState(() => new OrderService());

  // Connect Ethereum wallet
  const connectEthereum = async () => {
    try {
      const instance = await web3Modal.connect();
      const provider = new ethers.BrowserProvider(instance);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      
      setEthProvider(provider);
      setEthSigner(signer);
      setEthAccount(address);
    } catch (error) {
      console.error('Failed to connect Ethereum wallet:', error);
    }
  };

  const disconnectEthereum = async () => {
    await web3Modal.clearCachedProvider();
    setEthAccount(null);
    setEthProvider(null);
    setEthSigner(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Fusion+ Cross-Chain Swap</h1>
        <p>Swap between Ethereum and Aptos</p>
      </header>

      <div className="wallet-section">
        <div className="wallet-card">
          <h3>Ethereum Wallet</h3>
          {ethAccount ? (
            <div>
              <p>Connected: {ethAccount.slice(0, 6)}...{ethAccount.slice(-4)}</p>
              <button onClick={disconnectEthereum}>Disconnect</button>
            </div>
          ) : (
            <button onClick={connectEthereum}>Connect MetaMask</button>
          )}
        </div>

        <div className="wallet-card">
          <h3>Aptos Wallet</h3>
          {aptosAccount ? (
            <div>
              <p>Connected: {aptosAccount.address.slice(0, 6)}...{aptosAccount.address.slice(-4)}</p>
              <button onClick={disconnectAptos}>Disconnect</button>
            </div>
          ) : (
            <button onClick={() => connectAptos('Petra')}>Connect Petra</button>
          )}
        </div>
      </div>

      <main>
        <SwapInterface
          ethAccount={ethAccount}
          aptosAccount={aptosAccount?.address || null}
          ethSigner={ethSigner}
          orderService={orderService}
        />
        
        <OrderHistory
          ethAccount={ethAccount}
          aptosAccount={aptosAccount?.address || null}
          orderService={orderService}
        />
      </main>
    </div>
  );
}

export default App;