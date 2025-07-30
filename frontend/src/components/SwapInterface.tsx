import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { OrderService, Chain } from '../services/OrderService';
import { PriceService } from '../services/PriceService';
import { BalanceService } from '../services/BalanceService';

interface SwapInterfaceProps {
  ethAccount: string | null;
  aptosAccount: string | null;
  ethSigner: ethers.Signer | null;
  orderService: OrderService;
}

interface SwapStatus {
  stage: 'idle' | 'submitting' | 'waiting' | 'escrow_created' | 'completed' | 'error';
  message: string;
  orderId?: string;
  escrowHash?: string;
}

const SwapInterface: React.FC<SwapInterfaceProps> = ({
  ethAccount,
  aptosAccount,
  ethSigner,
  orderService
}) => {
  const [fromChain, setFromChain] = useState<Chain>(Chain.ETHEREUM);
  const [toChain, setToChain] = useState<Chain>(Chain.APTOS);
  const [fromAmount, setFromAmount] = useState('');
  const [minToAmount, setMinToAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [aptBalance, setAptBalance] = useState<string>('0');
  const [priceService] = useState(() => new PriceService());
  const [balanceService] = useState(() => new BalanceService());
  const [swapStatus, setSwapStatus] = useState<SwapStatus>({ stage: 'idle', message: '' });
  const [estimatedOutput, setEstimatedOutput] = useState<string>('');

  const handleSwap = async () => {
    if (!ethAccount || !aptosAccount || !ethSigner) {
      alert('Please connect both wallets');
      return;
    }

    if (!fromAmount || !minToAmount) {
      alert('Please enter amounts');
      return;
    }

    setIsLoading(true);
    setSwapStatus({ stage: 'submitting', message: 'Creating order...' });
    
    try {
      const orderData = {
        fromChain,
        toChain,
        fromToken: fromChain === Chain.ETHEREUM 
          ? ethers.ZeroAddress // ETH
          : '0x1::aptos_coin::AptosCoin', // APT
        toToken: toChain === Chain.ETHEREUM 
          ? ethers.ZeroAddress // ETH
          : '0x1::aptos_coin::AptosCoin', // APT
        fromAmount: fromChain === Chain.ETHEREUM 
          ? ethers.parseEther(fromAmount).toString()
          : (parseFloat(fromAmount) * 1e8).toString(),
        minToAmount: toChain === Chain.ETHEREUM
          ? ethers.parseEther(minToAmount).toString()
          : (parseFloat(minToAmount) * 1e8).toString(),
        maker: fromChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        receiver: toChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        nonce: Date.now().toString(),
        partialFillAllowed: false
      };

      // Sign the order
      const signature = await orderService.signOrder(orderData, ethSigner);
      
      // Submit the order
      const result = await orderService.createOrder({
        ...orderData,
        signature
      });

      const orderId = result?.id || orderData.nonce;
      setSwapStatus({ 
        stage: 'waiting', 
        message: 'Order submitted! Waiting for resolver...', 
        orderId 
      });

      // Subscribe to order updates
      orderService.subscribeToOrderUpdates(orderId, (update: any) => {
        console.log('Order update:', update);
        if (update.type === 'escrow:destination:created') {
          setSwapStatus({
            stage: 'escrow_created',
            message: `Resolver locked ${(parseInt(update.amount || '0') / 100000000).toFixed(4)} APT on Aptos!`,
            orderId,
            escrowHash: update.escrowHash
          });
        }
      });

      // Also listen for general escrow events
      const socket = (orderService as any).socket;
      socket.on('escrow:destination:created', (data: any) => {
        if (data.orderId === orderId) {
          setSwapStatus({
            stage: 'escrow_created',
            message: `Resolver locked ${(parseInt(data.amount || '0') / 100000000).toFixed(4)} APT on Aptos!`,
            orderId,
            escrowHash: data.secretHash
          });
        }
      });

      // Clean up after 60 seconds
      setTimeout(() => {
        orderService.unsubscribeFromOrderUpdates(orderId);
        socket.off('escrow:destination:created');
        if (swapStatus.stage === 'waiting') {
          setSwapStatus({
            stage: 'idle',
            message: 'Order timeout. Check order history for status.'
          });
        }
      }, 60000);
    } catch (error) {
      console.error('Failed to create order:', error);
      setSwapStatus({ 
        stage: 'error', 
        message: 'Failed to create order: ' + (error as Error).message 
      });
      alert('Failed to create order: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const switchChains = () => {
    setFromChain(toChain);
    setToChain(fromChain);
  };

  // Fetch exchange rate
  useEffect(() => {
    const fetchRate = async () => {
      const fromToken = fromChain === Chain.ETHEREUM ? 'ETH' : 'APT';
      const toToken = toChain === Chain.ETHEREUM ? 'ETH' : 'APT';
      
      try {
        const rate = await priceService.getExchangeRate(fromToken, toToken);
        setExchangeRate(rate);
      } catch (error) {
        console.error('Failed to fetch exchange rate:', error);
      }
    };

    fetchRate();
    const interval = setInterval(fetchRate, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [fromChain, toChain, priceService]);

  // Fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (ethAccount && ethSigner) {
        const provider = ethSigner.provider;
        if (provider) {
          const balance = await balanceService.getEthereumBalance(ethAccount, provider);
          setEthBalance(balance);
        }
      }

      if (aptosAccount) {
        const balance = await balanceService.getAptosBalance(aptosAccount);
        setAptBalance(balance);
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [ethAccount, aptosAccount, ethSigner, balanceService]);

  // Calculate estimated output when input changes
  useEffect(() => {
    if (fromAmount && exchangeRate) {
      const inputValue = parseFloat(fromAmount);
      if (!isNaN(inputValue) && inputValue > 0) {
        const estimated = inputValue * exchangeRate * 0.99; // 1% resolver fee
        // For APT, use 8 decimal precision to match backend
        const precision = toChain === Chain.APTOS ? 8 : 6;
        const estimatedStr = estimated.toFixed(precision);
        setEstimatedOutput(estimatedStr);
        // Set minToAmount slightly lower to account for price fluctuations
        const minAmount = estimated * 0.9999; // 0.01% buffer
        setMinToAmount(minAmount.toFixed(precision));
      } else {
        setEstimatedOutput('');
        setMinToAmount('');
      }
    }
  }, [fromAmount, exchangeRate, toChain]);

  return (
    <div className="swap-interface">
      <h2>Create Swap Order</h2>
      
      <div className="swap-form">
        <div className="form-group">
          <label>From Chain</label>
          <select 
            value={fromChain} 
            onChange={(e) => setFromChain(e.target.value as Chain)}
          >
            <option value={Chain.ETHEREUM}>Ethereum</option>
            <option value={Chain.APTOS}>Aptos</option>
          </select>
          <div className="balance-info">
            Balance: {fromChain === Chain.ETHEREUM ? ethBalance : aptBalance} {fromChain === Chain.ETHEREUM ? 'ETH' : 'APT'}
          </div>
        </div>

        <div className="form-group">
          <label>Amount</label>
          <input
            type="number"
            placeholder="0.0"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
          />
        </div>

        <button 
          type="button" 
          onClick={switchChains}
          style={{ alignSelf: 'center', padding: '10px', cursor: 'pointer' }}
        >
          ↕️ Switch
        </button>

        <div className="form-group">
          <label>To Chain</label>
          <select 
            value={toChain} 
            onChange={(e) => setToChain(e.target.value as Chain)}
          >
            <option value={Chain.ETHEREUM}>Ethereum</option>
            <option value={Chain.APTOS}>Aptos</option>
          </select>
          <div className="balance-info">
            Balance: {toChain === Chain.ETHEREUM ? ethBalance : aptBalance} {toChain === Chain.ETHEREUM ? 'ETH' : 'APT'}
          </div>
        </div>

        <div className="form-group">
          <label>Minimum Amount to Receive</label>
          <input
            type="number"
            placeholder="0.0"
            value={minToAmount}
            onChange={(e) => setMinToAmount(e.target.value)}
          />
        </div>

        {exchangeRate && (
          <div className="exchange-rate">
            <div>Exchange Rate: 1 {fromChain === Chain.ETHEREUM ? 'ETH' : 'APT'} = {exchangeRate.toFixed(4)} {toChain === Chain.ETHEREUM ? 'ETH' : 'APT'}</div>
            {estimatedOutput && (
              <div className="estimated-output">
                Estimated Output: {estimatedOutput} {toChain === Chain.ETHEREUM ? 'ETH' : 'APT'} (after 1% fee)
              </div>
            )}
          </div>
        )}

        {swapStatus.stage !== 'idle' && (
          <div className={`swap-status ${swapStatus.stage}`}>
            <div className="status-message">{swapStatus.message}</div>
            {swapStatus.orderId && (
              <div className="order-id">Order ID: {swapStatus.orderId}</div>
            )}
            {swapStatus.escrowHash && (
              <div className="escrow-info">
                <div>Secret Hash: {swapStatus.escrowHash.slice(0, 10)}...</div>
                <div className="next-step">Next: Lock your ETH on Ethereum to complete the swap</div>
              </div>
            )}
          </div>
        )}

        <button
          className="swap-button"
          onClick={handleSwap}
          disabled={isLoading || !ethAccount || !aptosAccount}
        >
          {isLoading ? 'Creating Order...' : 'Create Swap Order'}
        </button>
      </div>
    </div>
  );
};

export default SwapInterface;