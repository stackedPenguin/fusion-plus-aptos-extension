import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { OrderService, Chain } from '../services/OrderService';
import { PriceService } from '../services/PriceService';
import { PermitService } from '../services/PermitService';
import { CONTRACTS } from '../config/contracts';

interface SwapInterfaceProps {
  ethAccount: string | null;
  aptosAccount: string | null;
  ethSigner: ethers.Signer | null;
  orderService: OrderService;
  ethBalance: string;
  aptosBalance: string;
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
  orderService,
  ethBalance,
  aptosBalance
}) => {
  const [fromChain, setFromChain] = useState<Chain>(Chain.ETHEREUM);
  const [toChain, setToChain] = useState<Chain>(Chain.APTOS);
  const [fromAmount, setFromAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [priceService] = useState(() => new PriceService());
  const [swapStatus, setSwapStatus] = useState<SwapStatus>({ stage: 'idle', message: '' });
  const [estimatedOutput, setEstimatedOutput] = useState<string>('');
  const [focusedInput, setFocusedInput] = useState<'from' | 'to' | null>(null);
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [aptPrice, setAptPrice] = useState<number>(0);

  // Get current balances
  const currentBalances = {
    [Chain.ETHEREUM]: ethBalance,
    [Chain.APTOS]: aptosBalance
  };

  const fromBalance = currentBalances[fromChain];
  const toBalance = currentBalances[toChain];

  const handleSwap = async () => {
    if (!ethAccount || !aptosAccount || !ethSigner) {
      alert('Please connect both wallets');
      return;
    }

    if (!fromAmount || !estimatedOutput) {
      alert('Please enter amount');
      return;
    }

    setIsLoading(true);
    setSwapStatus({ stage: 'submitting', message: 'Preparing order with permit...' });
    
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
          ? ethers.parseEther((parseFloat(estimatedOutput) * 0.995).toString()).toString() // 0.5% slippage
          : Math.floor(parseFloat(estimatedOutput) * 1e8 * 0.995).toString(), // 0.5% slippage for resolver margin
        maker: fromChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        receiver: toChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        nonce: Date.now().toString(),
        partialFillAllowed: false
      };

      let finalOrderData: any;
      let signature: string;

      // If source chain is Ethereum, create a permit for automatic transfer
      if (fromChain === Chain.ETHEREUM) {
        setSwapStatus({ stage: 'submitting', message: 'Signing permit for automatic transfer...' });
        
        try {
          // Create order with permit
          const orderWithPermit = await PermitService.createOrderWithPermit(
            orderData,
            ethSigner,
            CONTRACTS.ETHEREUM.PERMIT,
            CONTRACTS.RESOLVER.ETHEREUM
          );
          
          finalOrderData = orderWithPermit;
          signature = orderWithPermit.signature;
          
          console.log('Order with permit created:', orderWithPermit);
        } catch (error) {
          console.error('Failed to create permit:', error);
          throw new Error(`Failed to create permit: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // For non-Ethereum source chains, use regular signature
        signature = await orderService.signOrder(orderData, ethSigner);
        finalOrderData = { ...orderData, signature };
      }

      setSwapStatus({ stage: 'submitting', message: 'Submitting order...' });
      
      // Submit the order
      const result = await orderService.createOrder(finalOrderData as any);

      const orderId = result?.id || orderData.nonce;
      setSwapStatus({ 
        stage: 'waiting', 
        message: 'Order submitted! Waiting for resolver...', 
        orderId 
      });

      // Notify the transaction panel
      if ((orderService as any).notifyOrderCreated) {
        (orderService as any).notifyOrderCreated(orderId, orderData);
      }

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

      // Clean up after 30 minutes
      setTimeout(() => {
        orderService.unsubscribeFromOrderUpdates(orderId);
        socket.off('escrow:destination:created');
        if (swapStatus.stage === 'waiting') {
          setSwapStatus({
            stage: 'idle',
            message: 'Order expired. Check order history for status.'
          });
        }
      }, 1800000); // 30 minutes
    } catch (error) {
      console.error('Failed to create order:', error);
      setSwapStatus({ 
        stage: 'error', 
        message: 'Failed to create order: ' + (error as Error).message 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const switchChains = () => {
    setFromChain(toChain);
    setToChain(fromChain);
    setFromAmount(estimatedOutput);
  };

  const handleMaxClick = () => {
    if (fromChain === Chain.ETHEREUM) {
      // Leave some ETH for gas
      const maxEth = Math.max(0, parseFloat(ethBalance) - 0.01);
      setFromAmount(maxEth.toFixed(6));
    } else {
      setFromAmount(aptosBalance);
    }
  };

  // Fetch exchange rate and USD prices
  useEffect(() => {
    const fetchRates = async () => {
      const fromToken = fromChain === Chain.ETHEREUM ? 'ETH' : 'APT';
      const toToken = toChain === Chain.ETHEREUM ? 'ETH' : 'APT';
      
      try {
        // Fetch exchange rate
        const rate = await priceService.getExchangeRate(fromToken, toToken);
        setExchangeRate(rate);
        
        // Fetch USD prices
        const [ethUsdPrice, aptUsdPrice] = await Promise.all([
          priceService.getUSDPrice('ETH'),
          priceService.getUSDPrice('APT')
        ]);
        setEthPrice(ethUsdPrice);
        setAptPrice(aptUsdPrice);
      } catch (error) {
        console.error('Failed to fetch rates:', error);
      }
    };

    fetchRates();
    const interval = setInterval(fetchRates, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [fromChain, toChain, priceService]);

  // Calculate estimated output when input changes
  useEffect(() => {
    if (fromAmount && exchangeRate) {
      const inputValue = parseFloat(fromAmount);
      if (!isNaN(inputValue) && inputValue > 0) {
        const estimated = inputValue * exchangeRate * 0.99; // 1% resolver fee
        // For APT, use 8 decimal precision to match backend
        const precision = toChain === Chain.APTOS ? 8 : 6;
        setEstimatedOutput(estimated.toFixed(precision));
      } else {
        setEstimatedOutput('');
      }
    } else {
      setEstimatedOutput('');
    }
  }, [fromAmount, exchangeRate, toChain]);

  const getButtonText = () => {
    if (!ethAccount || !aptosAccount) {
      return 'Connect Wallets';
    }
    if (!fromAmount || parseFloat(fromAmount) === 0) {
      return 'Enter an amount';
    }
    if (parseFloat(fromAmount) > parseFloat(fromBalance)) {
      return 'Insufficient balance';
    }
    if (isLoading) {
      return 'Creating Order...';
    }
    return 'Swap';
  };

  const isButtonDisabled = () => {
    return isLoading || 
      !ethAccount || 
      !aptosAccount || 
      !fromAmount || 
      parseFloat(fromAmount) === 0 ||
      parseFloat(fromAmount) > parseFloat(fromBalance);
  };

  return (
    <div className="swap-interface">
      <div className="swap-header">
        <h2>Swap</h2>
        <button className="settings-button">⚙</button>
      </div>
      
      <div className="swap-form">
        {/* From Token */}
        <div className={`token-input-group ${focusedInput === 'from' ? 'focused' : ''}`}>
          <div className="token-input-header">
            <span className="token-input-label">From</span>
            <div className="token-balance">
              Balance: {fromBalance}
              {parseFloat(fromBalance) > 0 && (
                <span className="max-button" onClick={handleMaxClick}>MAX</span>
              )}
            </div>
          </div>
          <div className="token-input-content">
            <div className="token-select">
              <div className="token-icon">
                {fromChain === Chain.ETHEREUM ? 'Ξ' : 'A'}
              </div>
              <span className="token-symbol">
                {fromChain === Chain.ETHEREUM ? 'ETH' : 'APT'}
              </span>
            </div>
            <input
              type="number"
              className="amount-input"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              onFocus={() => setFocusedInput('from')}
              onBlur={() => setFocusedInput(null)}
            />
          </div>
          {fromAmount && exchangeRate && (
            <div className="token-value">
              ≈ ${(parseFloat(fromAmount) * (fromChain === Chain.ETHEREUM ? ethPrice : aptPrice)).toFixed(2)}
            </div>
          )}
        </div>

        {/* Swap Direction Button */}
        <div className="swap-direction">
          <button className="swap-direction-button" onClick={switchChains}>
            ↓
          </button>
        </div>

        {/* To Token */}
        <div className={`token-input-group ${focusedInput === 'to' ? 'focused' : ''}`}>
          <div className="token-input-header">
            <span className="token-input-label">To</span>
            <div className="token-balance">
              Balance: {toBalance}
            </div>
          </div>
          <div className="token-input-content">
            <div className="token-select">
              <div className="token-icon">
                {toChain === Chain.ETHEREUM ? 'Ξ' : 'A'}
              </div>
              <span className="token-symbol">
                {toChain === Chain.ETHEREUM ? 'ETH' : 'APT'}
              </span>
            </div>
            <input
              type="number"
              className="amount-input"
              placeholder="0.0"
              value={estimatedOutput}
              readOnly
              onFocus={() => setFocusedInput('to')}
              onBlur={() => setFocusedInput(null)}
            />
          </div>
          {estimatedOutput && (
            <div className="token-value">
              ≈ ${(parseFloat(estimatedOutput) * (toChain === Chain.ETHEREUM ? ethPrice : aptPrice)).toFixed(2)}
            </div>
          )}
        </div>

        {/* Exchange Rate */}
        {exchangeRate && (
          <div className="exchange-rate">
            <span>Rate</span>
            <span className="rate-value">
              1 {fromChain === Chain.ETHEREUM ? 'ETH' : 'APT'} = {exchangeRate.toFixed(4)} {toChain === Chain.ETHEREUM ? 'ETH' : 'APT'}
            </span>
          </div>
        )}

        {/* Status Message */}
        {swapStatus.stage !== 'idle' && (
          <div className={`swap-status ${swapStatus.stage} fade-in`}>
            <div className="status-message">{swapStatus.message}</div>
            {swapStatus.orderId && (
              <div className="order-id">Order ID: {swapStatus.orderId.slice(0, 8)}...</div>
            )}
            {swapStatus.escrowHash && (
              <div className="escrow-info">
                <div className="next-step">
                  <strong>Next Step:</strong> To complete the swap, you need to create an Ethereum escrow.
                  <br />
                  <small>Note: In the full Fusion+ implementation, this would be done automatically via permit/approval.</small>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Swap Button */}
        <button
          className="swap-button"
          onClick={handleSwap}
          disabled={isButtonDisabled()}
        >
          {getButtonText()}
        </button>
      </div>
    </div>
  );
};

export default SwapInterface;