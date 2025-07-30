import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { OrderService, Chain } from '../services/OrderService';
import { PriceService } from '../services/PriceService';
import { PermitService } from '../services/PermitService';
import { WETHService } from '../services/WETHService';
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
  stage: 'idle' | 'wrapping_eth' | 'approving_weth' | 'submitting' | 'waiting' | 'escrow_created' | 'completed' | 'error';
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
  const [wethBalance, setWethBalance] = useState<string>('0');
  const [showWrapConfirmation, setShowWrapConfirmation] = useState(false);
  const [wrapAmount, setWrapAmount] = useState<string>('0');
  const [selectedToken, setSelectedToken] = useState<'ETH' | 'WETH'>('ETH');
  const [wrapConfirmationData, setWrapConfirmationData] = useState<{ amount: string; isVisible: boolean }>({ amount: '0', isVisible: false });

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
    
    try {
      // Check if we're swapping ETH from Ethereum
      const isETHSwap = fromChain === Chain.ETHEREUM;
      const swapAmount = isETHSwap ? ethers.parseEther(fromAmount).toString() : (parseFloat(fromAmount) * 1e8).toString();
      
      // Step 1: If swapping ETH, wrap to WETH first
      if (isETHSwap) {
        const wethService = new WETHService(ethSigner);
        
        // Check user's current WETH balance
        const currentWethBalance = await wethService.getBalance(ethAccount);
        console.log('Current WETH balance:', ethers.formatEther(currentWethBalance));
        
        // Check if user needs to wrap more ETH
        const needsWrapping = BigInt(currentWethBalance) < BigInt(swapAmount);
        
        if (needsWrapping) {
          const amountToWrap = BigInt(swapAmount) - BigInt(currentWethBalance);
          setWrapConfirmationData({ amount: ethers.formatEther(amountToWrap), isVisible: true });
          setIsLoading(false);
          return;
        }
          
          setSwapStatus({ stage: 'wrapping_eth', message: `Wrapping ${ethers.formatEther(amountToWrap)} ETH to WETH...` });
          try {
            // Only wrap the difference needed
            const wrapTx = await wethService.wrapETH(amountToWrap.toString());
            console.log('ETH wrapped to WETH:', wrapTx);
            
            // Verify WETH balance after wrapping
            const newWethBalance = await wethService.getBalance(ethAccount);
            console.log('WETH balance after wrapping:', ethers.formatEther(newWethBalance));
            
            if (BigInt(newWethBalance) < BigInt(swapAmount)) {
              throw new Error(`Still insufficient WETH after wrapping. Balance: ${ethers.formatEther(newWethBalance)}, Required: ${ethers.formatEther(swapAmount)}`);
            }
          } catch (error) {
            throw new Error(`Failed to wrap ETH: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          console.log('User already has enough WETH, skipping wrap step');
        }
        
        // Step 2: Check and handle WETH approval for the Escrow contract
        setSwapStatus({ stage: 'approving_weth', message: 'Checking WETH approval...' });
        const escrowAllowance = await wethService.getAllowance(ethAccount, CONTRACTS.ETHEREUM.ESCROW);
        
        if (escrowAllowance < BigInt(swapAmount)) {
          setSwapStatus({ stage: 'approving_weth', message: 'Approving WETH for escrow contract...' });
          try {
            const approveTx = await wethService.approve(
              CONTRACTS.ETHEREUM.ESCROW, // Approve escrow contract, not resolver
              ethers.MaxUint256.toString() // Infinite approval
            );
            console.log('WETH approved for escrow contract:', approveTx);
          } catch (error) {
            throw new Error(`Failed to approve WETH: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
      
      setSwapStatus({ stage: 'submitting', message: 'Preparing order with permit...' });
      
      const orderData = {
        fromChain,
        toChain,
        fromToken: fromChain === Chain.ETHEREUM 
          ? CONTRACTS.ETHEREUM.WETH // Use WETH instead of ETH
          : '0x1::aptos_coin::AptosCoin', // APT
        toToken: toChain === Chain.ETHEREUM 
          ? ethers.ZeroAddress // ETH
          : '0x1::aptos_coin::AptosCoin', // APT
        fromAmount: swapAmount,
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

      // If source chain is Ethereum, we can't use permits with WETH
      // WETH9 doesn't support EIP-2612 permits, only traditional approve/transferFrom
      if (fromChain === Chain.ETHEREUM) {
        setSwapStatus({ stage: 'submitting', message: 'Creating order...' });
        
        // For WETH, we need to ensure approval is done first (already handled above)
        // Then create a regular order without permit
        signature = await orderService.signOrder(orderData, ethSigner);
        finalOrderData = { ...orderData, signature };
        
        console.log('Order created with WETH (no permit - using approval):', finalOrderData);
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

      socket.on('swap:completed', (data: any) => {
        if (data.orderId === orderId) {
          setSwapStatus({
            stage: 'completed',
            message: `Swap completed successfully!`,
            orderId
          });
          
          // Update WETH balance after successful swap
          if (fromChain === Chain.ETHEREUM) {
            fetchWethBalance();
          }
        }
      });

      // Clean up after 30 minutes
      setTimeout(() => {
        orderService.unsubscribeFromOrderUpdates(orderId);
        socket.off('escrow:destination:created');
        socket.off('swap:completed');
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

  const handleWrapConfirm = async () => {
    setWrapConfirmationData({ ...wrapConfirmationData, isVisible: false });
    setIsLoading(true);
    
    try {
      const wethService = new WETHService(ethSigner);
      const amountToWrapWei = ethers.parseEther(wrapConfirmationData.amount).toString();
      
      setSwapStatus({ stage: 'wrapping_eth', message: `Wrapping ${wrapConfirmationData.amount} ETH to WETH...` });
      
      const wrapTx = await wethService.wrapETH(amountToWrapWei);
      console.log('ETH wrapped to WETH:', wrapTx);
      
      // Update WETH balance
      const newWethBalance = await wethService.getBalance(ethAccount);
      setWethBalance(ethers.formatEther(newWethBalance));
      
      // Switch to WETH in the UI
      setSelectedToken('WETH');
      
      // Continue with the swap
      setSwapStatus({ stage: 'submitting', message: 'Continuing with swap...' });
      await handleSwap();
    } catch (error) {
      console.error('Failed to wrap ETH:', error);
      setSwapStatus({ 
        stage: 'error', 
        message: `Failed to wrap ETH: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
      setIsLoading(false);
    }
  };

  const handleWrapCancel = () => {
    setWrapConfirmationData({ ...wrapConfirmationData, isVisible: false });
    setSwapStatus({ stage: 'idle', message: '' });
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

  // Function to fetch WETH balance
  const fetchWethBalance = async () => {
    if (ethAccount && ethSigner) {
      try {
        const wethService = new WETHService(ethSigner);
        const balance = await wethService.getBalance(ethAccount);
        setWethBalance(ethers.formatEther(balance));
      } catch (error) {
        console.error('Failed to fetch WETH balance:', error);
        setWethBalance('0');
      }
    }
  };

  // Fetch WETH balance
  useEffect(() => {
    fetchWethBalance();
    const interval = setInterval(fetchWethBalance, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [ethAccount, ethSigner]);

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
              {fromChain === Chain.ETHEREUM ? (
                <>
                  <span>ETH: {ethBalance}</span>
                  {parseFloat(wethBalance) > 0 && (
                    <span style={{ marginLeft: '10px' }}>WETH: {parseFloat(wethBalance).toFixed(4)}</span>
                  )}
                </>
              ) : (
                <span>Balance: {fromBalance}</span>
              )}
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
                {fromChain === Chain.ETHEREUM ? selectedToken : 'APT'}
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

        {/* Wrap Confirmation Dialog */}
        {wrapConfirmationData.isVisible && (
          <div className="wrap-confirmation-dialog">
            <div className="confirmation-header">
              <h3>Wrap ETH to WETH</h3>
              <p>To continue, you need to wrap your ETH to WETH for the swap.</p>
            </div>
            <div className="confirmation-details">
              <div className="detail-row">
                <span>Amount to wrap:</span>
                <span className="amount">{wrapConfirmationData.amount} ETH</span>
              </div>
              <div className="detail-row">
                <span>You will receive:</span>
                <span className="amount">{wrapConfirmationData.amount} WETH</span>
              </div>
            </div>
            <div className="confirmation-actions">
              <button className="cancel-button" onClick={handleWrapCancel}>
                Cancel
              </button>
              <button className="confirm-button" onClick={handleWrapConfirm}>
                Wrap ETH
              </button>
            </div>
          </div>
        )}

        {/* Status Message */}
        {swapStatus.stage !== 'idle' && (
          <div className={`swap-status ${swapStatus.stage} ${swapStatus.stage === 'completed' ? 'success-notification' : ''} fade-in`}>
            <div className="status-message">
              {swapStatus.stage === 'wrapping_eth' && '🔄 '}
              {swapStatus.stage === 'approving_weth' && '✅ '}
              {swapStatus.stage === 'submitting' && '📝 '}
              {swapStatus.stage === 'waiting' && '⏳ '}
              {swapStatus.stage === 'escrow_created' && '🔒 '}
              {swapStatus.stage === 'completed' && '🎉 '}
              {swapStatus.stage === 'error' && '❌ '}
              {swapStatus.message}
            </div>
            {swapStatus.orderId && (
              <div className="order-id">Order ID: {swapStatus.orderId.slice(0, 8)}...</div>
            )}
            {swapStatus.stage === 'completed' && (
              <div className="completion-details">
                <div className="success-icon">🎉</div>
                <p>Your swap has been completed successfully!</p>
                <p>Check your wallet for the received funds.</p>
              </div>
            )}
            {swapStatus.escrowHash && swapStatus.stage !== 'completed' && (
              <div className="escrow-info">
                <div className="next-step">
                  <strong>Processing swap...</strong>
                  <br />
                  <small>The resolver will complete the swap automatically.</small>
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