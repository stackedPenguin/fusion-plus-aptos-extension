import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { OrderService, Chain } from '../services/OrderService';
import { PriceService } from '../services/PriceService';
import { WETHService } from '../services/WETHService';
import { AssetFlowLogger } from '../services/AssetFlowLogger';
import { CONTRACTS } from '../config/contracts';

interface SwapInterfaceProps {
  ethAccount: string | null;
  aptosAccount: string | null;
  ethSigner: ethers.Signer | null;
  orderService: OrderService;
  ethBalance: string;
  aptosBalance: string;
}

const TOKEN_ICONS = {
  ETH: 'https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png',
  WETH: 'https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
  APT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/21794.png'
};

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
  const [selectedToken, setSelectedToken] = useState<'ETH' | 'WETH'>('ETH');
  const [showTokenMenu, setShowTokenMenu] = useState(false);
  const [wrapConfirmationData, setWrapConfirmationData] = useState<{ amount: string; isVisible: boolean }>({ amount: '0', isVisible: false });
  const [showResolverStatus, setShowResolverStatus] = useState(false);
  const [resolverBalances, setResolverBalances] = useState<any>(null);
  const [allowPartialFill, setAllowPartialFill] = useState(false);

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
    
    // Initialize asset flow logger
    const logger = new AssetFlowLogger(ethSigner, ethAccount, aptosAccount);
    
    // Log pre-swap state asynchronously to avoid blocking
    logger.logPreSwapState(fromAmount, selectedToken).catch(err => 
      console.error('Failed to log pre-swap state:', err)
    );
    
    try {
      // Check if we're swapping from Ethereum
      const isEthereumSwap = fromChain === Chain.ETHEREUM;
      const swapAmount = isEthereumSwap ? ethers.parseEther(fromAmount).toString() : (parseFloat(fromAmount) * 1e8).toString();
      
      // Step 1: If swapping ETH (not WETH), wrap to WETH first
      if (isEthereumSwap && selectedToken === 'ETH') {
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
        } else {
          console.log('User already has enough WETH, skipping wrap step');
        }
      }
      
      // Step 2: If using WETH, check and handle approval for the Escrow contract
      if (isEthereumSwap) {
        const wethService = new WETHService(ethSigner);
        setSwapStatus({ stage: 'approving_weth', message: 'Checking WETH approval...' });
        await logger.logSwapStep('✅ Checking WETH approval for escrow contract');
        const escrowAllowance = await wethService.getAllowance(ethAccount, CONTRACTS.ETHEREUM.ESCROW);
        
        if (escrowAllowance < BigInt(swapAmount)) {
          setSwapStatus({ stage: 'approving_weth', message: 'Approving WETH for escrow contract...' });
          await logger.logSwapStep('📝 Approving WETH for escrow contract', `Amount: ${ethers.formatEther(swapAmount)} WETH`);
          try {
            const approveTx = await wethService.approve(
              CONTRACTS.ETHEREUM.ESCROW, // Approve escrow contract, not resolver
              ethers.MaxUint256.toString() // Infinite approval
            );
            console.log('WETH approved for escrow contract:', approveTx);
            await logger.logSwapStep('✅ WETH approval confirmed', `TxHash: ${approveTx}`);
          } catch (error) {
            throw new Error(`Failed to approve WETH: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          await logger.logSwapStep('✅ WETH already approved for escrow contract');
        }
      }
      
      setSwapStatus({ stage: 'submitting', message: 'Preparing order with permit...' });
      await logger.logSwapStep('📋 Preparing swap order');
      
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
        partialFillAllowed: allowPartialFill
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
      await logger.logSwapStep('🚀 Submitting order to resolver', `Order ID: ${orderData.nonce}`);
      
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
      orderService.subscribeToOrderUpdates(orderId, async (update: any) => {
        console.log('Order update:', update);
        if (update.type === 'escrow:destination:created') {
          await logger.logSwapStep('🔒 Destination escrow created on Aptos', `Resolver locked ${(parseInt(update.amount || '0') / 100000000).toFixed(4)} APT`);
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
      socket.on('escrow:destination:created', async (data: any) => {
        if (data.orderId === orderId) {
          const amount = (parseInt(data.amount || '0') / 100000000).toFixed(4);
          let message = `Resolver locked ${amount} APT on Aptos!`;
          
          if (data.isPartialFill) {
            const fillPercent = ((data.fillRatio || 0) * 100).toFixed(1);
            message = `🧩 PARTIAL FILL: Resolver locked ${amount} APT (${fillPercent}% of order)`;
            await logger.logSwapStep('🧩 Partial fill on destination', `Resolver filled ${fillPercent}% of your order with ${amount} APT`);
          } else {
            await logger.logSwapStep('🔒 Destination escrow created on Aptos', `Resolver locked ${amount} APT`);
          }
          
          setSwapStatus({
            stage: 'escrow_created',
            message,
            orderId,
            escrowHash: data.secretHash
          });
        }
      });
      
      // Listen for source escrow creation
      socket.on('escrow:source:created', async (data: any) => {
        if (data.orderId === orderId) {
          await logger.logSwapStep('🔒 Source escrow created on Ethereum', `User WETH locked: ${ethers.formatEther(data.amount || '0')} WETH`);
        }
      });
      
      // Listen for source withdrawal (resolver claims WETH)
      socket.on('escrow:source:withdrawn', async (data: any) => {
        if (data.orderId === orderId) {
          await logger.logSwapStep('💰 Resolver withdrew user WETH', 'Source escrow completed');
        }
      });

      socket.on('swap:completed', async (data: any) => {
        if (data.orderId === orderId) {
          const receivedAmount = (parseFloat(data.toAmount || '0') / 100000000).toFixed(4);
          const isPartialFill = parseFloat(receivedAmount) < parseFloat(estimatedOutput) * 0.95; // Consider partial if < 95% of expected
          
          if (isPartialFill) {
            await logger.logSwapStep('🧩 Partial swap completed!', `User received ${receivedAmount} APT (partial fill)`);
          } else {
            await logger.logSwapStep('🎉 Swap completed successfully!', `User received ${receivedAmount} APT`);
          }
          
          await logger.logPostSwapState(orderId);
          
          setSwapStatus({
            stage: 'completed',
            message: isPartialFill 
              ? `🧩 Partial swap completed! You received ${receivedAmount} APT`
              : `Swap completed successfully! You received ${receivedAmount} APT`,
            orderId
          });
          
          // Update both WETH and APT balances after successful swap
          if (fromChain === Chain.ETHEREUM) {
            // Immediate update
            fetchWethBalance();
            // Additional updates with delays to account for blockchain confirmation times
            setTimeout(() => fetchWethBalance(), 3000);
            setTimeout(() => fetchWethBalance(), 8000);
            setTimeout(() => fetchWethBalance(), 15000);
          }
          // Trigger parent component to refresh APT balance
          window.dispatchEvent(new Event('refreshBalances'));
          setTimeout(() => window.dispatchEvent(new Event('refreshBalances')), 5000);
        }
      });

      // Clean up after 30 minutes
      setTimeout(() => {
        orderService.unsubscribeFromOrderUpdates(orderId);
        socket.off('escrow:destination:created');
        socket.off('escrow:source:created');
        socket.off('escrow:source:withdrawn');
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
      if (selectedToken === 'ETH') {
        // Leave some ETH for gas
        const maxEth = Math.max(0, parseFloat(ethBalance) - 0.01);
        setFromAmount(maxEth.toFixed(6));
      } else {
        // For WETH, can use full balance
        setFromAmount(wethBalance);
      }
    } else {
      setFromAmount(aptosBalance);
    }
  };

  const handleWrapConfirm = async () => {
    setWrapConfirmationData({ ...wrapConfirmationData, isVisible: false });
    setIsLoading(true);
    
    try {
      if (!ethSigner || !ethAccount) {
        throw new Error('Wallet not connected');
      }
      
      const logger = new AssetFlowLogger(ethSigner, ethAccount, aptosAccount);
      await logger.logSwapStep('🔄 Wrapping ETH to WETH', `Amount: ${wrapConfirmationData.amount} ETH`);
      
      const wethService = new WETHService(ethSigner);
      const amountToWrapWei = ethers.parseEther(wrapConfirmationData.amount).toString();
      
      setSwapStatus({ stage: 'wrapping_eth', message: `Wrapping ${wrapConfirmationData.amount} ETH to WETH...` });
      
      const wrapTx = await wethService.wrapETH(amountToWrapWei);
      console.log('ETH wrapped to WETH:', wrapTx);
      await logger.logSwapStep('✅ ETH wrapped to WETH successfully', `TxHash: ${wrapTx}`);
      
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
  const fetchWethBalance = useCallback(async () => {
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
  }, [ethAccount, ethSigner]);

  // Fetch WETH balance
  useEffect(() => {
    fetchWethBalance();
    const interval = setInterval(fetchWethBalance, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [fetchWethBalance]);

  // Auto-select WETH if user has WETH balance but no ETH
  useEffect(() => {
    if (fromChain === Chain.ETHEREUM && parseFloat(wethBalance) > 0 && parseFloat(ethBalance) < 0.01) {
      setSelectedToken('WETH');
    }
  }, [fromChain, wethBalance, ethBalance]);

  // Close token menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showTokenMenu && !(e.target as HTMLElement).closest('.token-select')) {
        setShowTokenMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showTokenMenu]);

  // Function to fetch resolver status
  const fetchResolverStatus = async () => {
    if (ethSigner && ethAccount) {
      const logger = new AssetFlowLogger(ethSigner, ethAccount, aptosAccount);
      const balances = await logger.getResolverStatus();
      setResolverBalances(balances);
      setShowResolverStatus(true);
      
      console.log('🏛️ ========== RESOLVER STATUS ==========');
      console.log('Ethereum Resolver:', CONTRACTS.RESOLVER.ETHEREUM);
      console.log(`  • ETH: ${balances.ethereum.eth}`);
      console.log(`  • WETH: ${balances.ethereum.weth}`);
      console.log('Aptos Resolver:', CONTRACTS.RESOLVER.APTOS);
      console.log(`  • APT: ${balances.aptos.apt}`);
      console.log('=====================================');
    }
  };

  const getButtonText = () => {
    if (swapStatus.stage === 'completed') {
      return 'Start New Swap';
    }
    if (!ethAccount || !aptosAccount) {
      return 'Connect Wallets';
    }
    if (!fromAmount || parseFloat(fromAmount) === 0) {
      return 'Enter an amount';
    }
    const balance = fromChain === Chain.ETHEREUM && selectedToken === 'WETH' ? wethBalance : fromBalance;
    if (parseFloat(fromAmount) > parseFloat(balance)) {
      return 'Insufficient balance';
    }
    if (isLoading || swapStatus.stage !== 'idle') {
      return 'Processing...';
    }
    return 'Swap';
  };

  const isButtonDisabled = () => {
    const balance = fromChain === Chain.ETHEREUM && selectedToken === 'WETH' ? wethBalance : fromBalance;
    return isLoading || 
      swapStatus.stage !== 'idle' ||
      !ethAccount || 
      !aptosAccount || 
      !fromAmount || 
      parseFloat(fromAmount) === 0 ||
      parseFloat(fromAmount) > parseFloat(balance);
  };

  return (
    <>
    <div className="swap-interface">
      <div className="swap-header">
        <h2>Swap</h2>
        <div className="header-actions">
          <button 
            className="resolver-status-button"
            onClick={fetchResolverStatus}
            title="Show Resolver Wallet Status"
          >
            🏛️ Resolver Status
          </button>
        </div>
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
            <div className="token-select" onClick={() => fromChain === Chain.ETHEREUM && setShowTokenMenu(!showTokenMenu)}>
              <img 
                className="token-icon" 
                src={fromChain === Chain.ETHEREUM 
                  ? (selectedToken === 'ETH' ? TOKEN_ICONS.ETH : TOKEN_ICONS.WETH)
                  : TOKEN_ICONS.APT
                }
                alt={fromChain === Chain.ETHEREUM ? selectedToken : 'APT'}
              />
              <span className="token-symbol">
                {fromChain === Chain.ETHEREUM ? selectedToken : 'APT'}
              </span>
              {fromChain === Chain.ETHEREUM && (
                <span className="dropdown-arrow">▼</span>
              )}
              {showTokenMenu && fromChain === Chain.ETHEREUM && (
                <div className="token-menu">
                  <div 
                    className={`token-option ${selectedToken === 'ETH' ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedToken('ETH');
                      setShowTokenMenu(false);
                    }}
                  >
                    <div className="token-option-info">
                      <img className="token-icon-small" src={TOKEN_ICONS.ETH} alt="ETH" />
                      <span>ETH</span>
                    </div>
                  </div>
                  <div 
                    className={`token-option ${selectedToken === 'WETH' ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedToken('WETH');
                      setShowTokenMenu(false);
                    }}
                  >
                    <div className="token-option-info">
                      <img className="token-icon-small" src={TOKEN_ICONS.WETH} alt="WETH" />
                      <span>WETH</span>
                    </div>
                  </div>
                </div>
              )}
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
              <img 
                className="token-icon" 
                src={toChain === Chain.ETHEREUM ? TOKEN_ICONS.ETH : TOKEN_ICONS.APT}
                alt={toChain === Chain.ETHEREUM ? 'ETH' : 'APT'}
              />
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

        {/* Partial Fill Toggle */}
        <div className="partial-fill-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={allowPartialFill}
              onChange={(e) => setAllowPartialFill(e.target.checked)}
              className="toggle-checkbox"
            />
            <span className="toggle-switch"></span>
            <span className="toggle-text">Allow partial fills</span>
          </label>
          <div className="toggle-info">
            <span className="info-text">When enabled, resolvers can fill your order partially</span>
          </div>
        </div>

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
              <div className="order-id">
                Order ID: {swapStatus.orderId.slice(0, 8)}...
                {allowPartialFill && <span className="partial-fill-indicator"> • 🧩 Partial fills enabled</span>}
              </div>
            )}
            {swapStatus.stage === 'completed' && (
              <div className="completion-details">
                <div className="success-icon">🎉</div>
                <p>Your swap has been completed successfully!</p>
                <p>Check your wallet for the received APT.</p>
                <div className="completion-actions">
                  <button 
                    className="new-swap-button"
                    onClick={() => {
                      setSwapStatus({ stage: 'idle', message: '' });
                      setFromAmount('');
                      setEstimatedOutput('');
                    }}
                  >
                    Start New Swap
                  </button>
                </div>
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
          onClick={swapStatus.stage === 'completed' ? () => {
            setSwapStatus({ stage: 'idle', message: '' });
            setFromAmount('');
            setEstimatedOutput('');
          } : handleSwap}
          disabled={isButtonDisabled()}
        >
          {getButtonText()}
        </button>
      </div>
    </div>

    {/* Resolver Status Modal - Outside swap-interface */}
    {showResolverStatus && (
      <div className="modal-overlay" onClick={() => setShowResolverStatus(false)}>
        <div className="modal-content resolver-status-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>🏛️ Resolver Wallet Status</h3>
            <button 
              className="modal-close-button"
              onClick={() => setShowResolverStatus(false)}
            >
              ✕
            </button>
          </div>
          {resolverBalances ? (
            <>
              <div className="modal-body">
                <div className="resolver-wallet">
                  <h4>Ethereum Resolver</h4>
                  <p className="wallet-address">{CONTRACTS.RESOLVER.ETHEREUM}</p>
                  <div className="balance-row">
                    <span>ETH:</span>
                    <span className="balance-value">{resolverBalances.ethereum.eth}</span>
                  </div>
                  <div className="balance-row">
                    <span>WETH:</span>
                    <span className="balance-value">{resolverBalances.ethereum.weth}</span>
                  </div>
                </div>
                <div className="resolver-wallet">
                  <h4>Aptos Resolver</h4>
                  <p className="wallet-address">{CONTRACTS.RESOLVER.APTOS}</p>
                  <div className="balance-row">
                    <span>APT:</span>
                    <span className="balance-value">{resolverBalances.aptos.apt}</span>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <p className="resolver-status-note">
                  💡 <strong>Demo Note:</strong> These are the resolver's liquidity pools. During swaps, the resolver temporarily locks destination tokens and earns source tokens as fees.
                </p>
              </div>
            </>
          ) : (
            <div className="modal-body">
              <div className="loading-spinner">Loading...</div>
            </div>
          )}
        </div>
      </div>
    )}
  </>
  );
};

export default SwapInterface;