import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { PetraWallet } from 'petra-plugin-wallet-adapter';
import { PontemWallet } from '@pontem/wallet-adapter-plugin';
import { MSafeWalletAdapter } from '@msafe/aptos-wallet-adapter';
import { RiseWallet } from '@rise-wallet/wallet-adapter';
import { TrustWallet } from '@trustwallet/aptos-wallet-adapter';
import { MartianWallet } from '@martianwallet/aptos-wallet-adapter';

// Add multiple wallets to test which support sponsored transactions
const wallets = [
  new PetraWallet(),
  new MartianWallet(),
  new PontemWallet(),
  new MSafeWalletAdapter(),
  new RiseWallet(),
  new TrustWallet()
];

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <AptosWalletAdapterProvider 
      plugins={wallets} 
      autoConnect={true}
    >
      <App />
    </AptosWalletAdapterProvider>
  </React.StrictMode>
);