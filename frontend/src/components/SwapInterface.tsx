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
  stage: 'idle' | 'wrapping_eth' | 'approving_weth' | 'approving_token' | 'submitting' | 'waiting' | 'escrow_created' | 'completed' | 'error' | 'processing';
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
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [wrapConfirmationData, setWrapConfirmationData] = useState<{ amount: string; isVisible: boolean }>({ amount: '0', isVisible: false });
  const [showResolverStatus, setShowResolverStatus] = useState(false);
  const [resolverBalances, setResolverBalances] = useState<any>(null);
  const [allowPartialFill, setAllowPartialFill] = useState(false);
  const [showWrapInterface, setShowWrapInterface] = useState(false);
  const [wrapAmount, setWrapAmount] = useState('');
  const [isWrapping, setIsWrapping] = useState(false);

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

    // If ETH is selected, show the wrap interface instead of proceeding with swap
    if (fromChain === Chain.ETHEREUM && selectedToken === 'ETH') {
      setWrapAmount(fromAmount);
      setShowWrapInterface(true);
      return;
    }
    

    setIsLoading(true);
    
    // Initialize asset flow logger
    const logger = new AssetFlowLogger(ethSigner, ethAccount, aptosAccount);
    
    // Log pre-swap state asynchronously to avoid blocking
    logger.logPreSwapState(fromAmount, fromChain === Chain.APTOS ? 'APT' : selectedToken, fromChain === Chain.APTOS ? 'APTOS' : 'ETHEREUM').catch(err => 
      console.error('Failed to log pre-swap state:', err)
    );
    
    try {
      // Check if we're swapping from Ethereum
      const isEthereumSwap = fromChain === Chain.ETHEREUM;
      // Handle different decimals for different tokens
      let swapAmount: string;
      if (isEthereumSwap) {
        // ETH/WETH have 18 decimals
        swapAmount = ethers.parseEther(fromAmount).toString();
      } else {
        swapAmount = (parseFloat(fromAmount) * 1e8).toString();
      }
      
      // We should only reach here if WETH is selected
      
      // Step 2: If using ERC20 tokens, check and handle approval for the Escrow contract
      if (isEthereumSwap && selectedToken !== 'ETH') {
        if (selectedToken === 'WETH') {
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
      }
      
      setSwapStatus({ stage: 'submitting', message: 'Preparing order with permit...' });
      await logger.logSwapStep('📋 Preparing swap order');
      
      // Generate secret for the swap (as per Fusion+ spec, user creates the secret)
      const secret = ethers.randomBytes(32);
      const secretHash = ethers.keccak256(secret);
      
      // Store secret for later reveal (only after both escrows are created)
      (window as any).__fusionPlusSecret = {
        secret: ethers.hexlify(secret),
        secretHash,
        orderId: null, // Will be set after order creation
        revealed: false
      };
      
      const orderData = {
        fromChain,
        toChain,
        fromToken: fromChain === Chain.ETHEREUM 
          ? CONTRACTS.ETHEREUM.WETH
          : '0x1::aptos_coin::AptosCoin', // APT
        toToken: toChain === Chain.ETHEREUM 
          ? (fromChain === Chain.APTOS ? CONTRACTS.ETHEREUM.WETH : ethers.ZeroAddress) // WETH for APT->ETH, ETH for ETH->APT
          : '0x1::aptos_coin::AptosCoin', // APT
        fromAmount: swapAmount,
        minToAmount: toChain === Chain.ETHEREUM
          ? ethers.parseEther((parseFloat(estimatedOutput) * 0.995).toFixed(18)).toString() // 0.5% slippage, fixed to 18 decimals
          : Math.floor(parseFloat(estimatedOutput) * 1e8 * 0.995).toString(), // 0.5% slippage for resolver margin
        maker: fromChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        receiver: toChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        nonce: Date.now().toString(),
        partialFillAllowed: allowPartialFill,
        secretHash // Include user-generated secret hash in the order
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

      // Update stored secret with orderId
      if ((window as any).__fusionPlusSecret) {
        (window as any).__fusionPlusSecret.orderId = orderId;
      }

      // Store order data for later use
      const currentOrderData = orderData;
      
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
      console.log('🔌 Socket connected:', socket.connected);
      console.log('🆔 Socket ID:', socket.id);
      
      // Listen for order errors
      socket.on('order:error', (data: any) => {
        if (data.orderId === orderId) {
          console.error('Order error:', data);
          setSwapStatus({
            stage: 'error',
            message: `❌ ${data.reason || data.error}`,
            orderId
          });
          setIsLoading(false);
        }
      });
      
      socket.on('escrow:destination:created', async (data: any) => {
        if (data.orderId === orderId) {
          // Format amount based on destination chain
          let amount: string;
          let tokenSymbol: string;
          
          if (data.chain === 'APTOS') {
            // APT has 8 decimals
            amount = (parseInt(data.amount || '0') / 100000000).toFixed(4);
            tokenSymbol = 'APT';
          } else {
            // ETH/WETH has 18 decimals
            amount = ethers.formatEther(data.amount || '0');
            tokenSymbol = 'WETH';
          }
          
          let message = `Resolver locked ${amount} ${tokenSymbol} on ${data.chain === 'APTOS' ? 'Aptos' : 'Ethereum'}!`;
          
          if (data.isPartialFill) {
            const fillPercent = ((data.fillRatio || 0) * 100).toFixed(1);
            message = `🧩 PARTIAL FILL: Resolver locked ${amount} ${tokenSymbol} (${fillPercent}% of order)`;
            await logger.logSwapStep('🧩 Partial fill on destination', `Resolver filled ${fillPercent}% of your order with ${amount} ${tokenSymbol}`);
          } else {
            await logger.logSwapStep(`🔒 Destination escrow created on ${data.chain === 'APTOS' ? 'Aptos' : 'Ethereum'}`, `Resolver locked ${amount} ${tokenSymbol}`);
          }
          
          setSwapStatus({
            stage: 'escrow_created',
            message,
            orderId,
            escrowHash: data.secretHash
          });
          
          // For APT -> WETH swaps, automatically trigger APT escrow creation
          if (fromChain === Chain.APTOS && data.chain === 'ETHEREUM') {
            console.log('🔄 Automatically triggering APT escrow creation...');
            
            // In a real implementation, this would:
            // 1. Use Aptos SDK to create the escrow transaction
            // 2. Prompt the user's Aptos wallet to sign
            // 3. Submit the transaction
            
            // Sign off-chain order for Fusion+ protocol
            setTimeout(async () => {
              console.log('📝 Signing off-chain Fusion+ order...');
              await logger.logSwapStep('🔏 Signing Fusion+ order', 'Creating gasless swap intent');
              
              // Use the user's secret hash, not the resolver's
              const userSecretHash = (window as any).__fusionPlusSecret?.secretHash || data.secretHash;
              const sourceEscrowId = ethers.id(data.orderId + '-source-' + userSecretHash);
              
              // Create timestamp and expiry
              const now = Math.floor(Date.now() / 1000);
              const expiry = now + 300; // 5 minutes from now
              const nonce = Date.now();
              
              // Create the order message to sign
              const orderMessage = {
                escrow_id: Array.from(ethers.getBytes(sourceEscrowId)),
                depositor: aptosAccount,
                beneficiary: CONTRACTS.RESOLVER.APTOS,
                amount: currentOrderData.fromAmount,
                hashlock: Array.from(ethers.getBytes(userSecretHash)), // Use user's secret hash
                timelock: data.timelock,
                nonce: nonce,
                expiry: expiry
              };
              
              console.log('Order to sign:', orderMessage);
              
              try {
                // Get account info for public key
                const accountInfo = await (window as any).aptos.account();
                console.log('Account info:', accountInfo);
                
                // Create a human-readable message for signing
                const readableMessage = `Fusion+ Swap Order:
From: ${(parseInt(currentOrderData.fromAmount) / 100000000).toFixed(4)} APT
To: ${currentOrderData.minToAmount} WETH
Beneficiary: ${CONTRACTS.RESOLVER.APTOS}
Order ID: ${data.orderId}
Nonce: ${nonce}
Expires: ${new Date(expiry * 1000).toLocaleString()}`;
                
                // Sign the message using Petra wallet
                const signatureResponse = await (window as any).aptos.signMessage({
                  message: readableMessage,
                  nonce: nonce.toString()
                });
                
                console.log('✅ Order signed!', signatureResponse);
                
                // Send signed order to resolver via order engine
                const socket = (orderService as any).socket;
                socket.emit('order:signed', {
                  orderId: data.orderId,
                  orderMessage: orderMessage,
                  signature: signatureResponse.signature,
                  publicKey: accountInfo.publicKey,
                  fullMessage: signatureResponse.fullMessage || readableMessage,
                  fromChain: 'APTOS',
                  toChain: 'ETHEREUM',
                  fromAmount: currentOrderData.fromAmount,
                  toAmount: currentOrderData.minToAmount,
                  secretHash: userSecretHash // Send user's secret hash
                });
                
                await logger.logSwapStep('✅ Fusion+ order signed', 'Waiting for resolver to create escrows (gasless)');
                
                // Update status to show we're waiting for resolver
                setSwapStatus({
                  stage: 'processing',
                  message: 'Resolver creating escrows...',
                  orderId: data.orderId
                });
                
              } catch (error: any) {
                console.error('Failed to sign order:', error);
                
                // Update transaction status to failed
                const socket = (orderService as any).socket;
                socket.emit('order:failed', {
                  orderId: data.orderId,
                  reason: error.message || 'Failed to sign order',
                  stage: 'order_signing'
                });
                
                // Update swap status
                setSwapStatus({
                  stage: 'error',
                  message: 'Failed to sign order',
                  orderId: data.orderId
                });
                setIsLoading(false);
                
                // Show user-friendly error message
                if (error.code === 4001) {
                  alert('Signature rejected by user');
                } else {
                  alert(`Failed to sign order: ${error.message || 'Unknown error'}`);
                }
              }
            }, 1000);
          }
        }
      });
      
      // Listen for source escrow creation
      socket.on('escrow:source:created', async (data: any) => {
        if (data.orderId === orderId) {
          await logger.logSwapStep('🔒 Source escrow created on Ethereum', `User WETH locked: ${ethers.formatEther(data.amount || '0')} WETH`);
          // Force immediate balance refresh when source escrow is created
          fetchWethBalance();
          setTimeout(() => fetchWethBalance(), 1000);
          setTimeout(() => fetchWethBalance(), 3000);
        }
      });
      
      // Listen for source withdrawal (resolver claims WETH)
      socket.on('escrow:source:withdrawn', async (data: any) => {
        if (data.orderId === orderId) {
          await logger.logSwapStep('💰 Resolver withdrew user WETH', 'Source escrow completed');
          // Force balance refresh after withdrawal
          fetchWethBalance();
          window.dispatchEvent(new Event('refreshBalances'));
          // Multiple attempts to ensure balance is updated
          setTimeout(() => {
            fetchWethBalance();
            window.dispatchEvent(new Event('refreshBalances'));
          }, 1500);
          setTimeout(() => fetchWethBalance(), 5000);
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
          
          // Reset loading state when swap completes
          setIsLoading(false);
          
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
      
      // Listen for secret request from resolver (after both escrows exist)
      socket.on('secret:request', async (data: any) => {
        console.log('🔐 Received secret:request event:', data);
        console.log('   Current orderId:', orderId);
        console.log('   Stored secret data:', (window as any).__fusionPlusSecret);
        
        if (data.orderId === orderId && (window as any).__fusionPlusSecret) {
          const secretData = (window as any).__fusionPlusSecret;
          if (!secretData.revealed && secretData.orderId === orderId) {
            console.log('🔐 Resolver requesting secret, both escrows confirmed');
            await logger.logSwapStep('🔐 Revealing secret to resolver', 'Both escrows confirmed on-chain');
            
            // Reveal secret to resolver
            socket.emit('secret:reveal', {
              orderId: orderId,
              secret: secretData.secret,
              secretHash: secretData.secretHash
            });
            
            secretData.revealed = true;
            await logger.logSwapStep('✅ Secret revealed', 'Resolver can now complete the swap');
          }
        }
      });
      
      // Listen for manual withdrawal required event
      socket.on('swap:manual_withdrawal_required', async (data: any) => {
        if (data.orderId === orderId) {
          await logger.logSwapStep('⚠️ Manual withdrawal required', `Reason: ${data.reason}`);
          console.log('🔑 Secret for manual withdrawal:', data.secret);
          
          setSwapStatus({
            stage: 'error',
            message: `⚠️ ${data.reason}. The resolver revealed the secret but couldn't complete the withdrawal. You can manually withdraw ${(parseInt(data.amount) / 100000000).toFixed(4)} APT using the secret: ${data.secret.slice(0, 10)}...`,
            orderId
          });
          
          // Reset loading state on error
          setIsLoading(false);
        }
      });

      // Clean up after 30 minutes
      setTimeout(() => {
        orderService.unsubscribeFromOrderUpdates(orderId);
        socket.off('order:error');
        socket.off('escrow:destination:created');
        socket.off('escrow:source:created');
        socket.off('escrow:source:withdrawn');
        socket.off('swap:completed');
        socket.off('swap:manual_withdrawal_required');
        if (swapStatus.stage === 'waiting') {
          setSwapStatus({
            stage: 'idle',
            message: 'Order expired. Check order history for status.'
          });
        }
      }, 1800000); // 30 minutes
    } catch (error) {
      console.error('Failed to create order:', error);
      let errorMessage = 'Failed to create order: ';
      
      if (error instanceof Error) {
        // Handle decimal precision errors
        if (error.message.includes('too many decimals') || error.message.includes('underflow')) {
          errorMessage = 'Amount too small or has too many decimal places. Please try a different amount.';
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Unknown error';
      }
      
      setSwapStatus({ 
        stage: 'error', 
        message: errorMessage
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
      let fromToken = fromChain === Chain.ETHEREUM 
        ? 'ETH' 
        : 'APT';
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
  }, [fromChain, toChain, priceService, selectedToken]);

  // Calculate estimated output when input changes
  useEffect(() => {
    if (fromAmount && exchangeRate) {
      const inputValue = parseFloat(fromAmount);
      if (!isNaN(inputValue) && inputValue > 0) {
        const estimated = inputValue * exchangeRate * 0.99; // 1% resolver fee
        // Use appropriate decimal precision for each chain
        const precision = toChain === Chain.APTOS ? 8 : 18; // APT has 8 decimals, ETH has 18
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
        const formattedBalance = ethers.formatEther(balance);
        setWethBalance(formattedBalance);
        
        // Also log for debugging
        console.log(`WETH Balance fetched: ${formattedBalance} (raw: ${balance.toString()})`);
      } catch (error) {
        console.error('Failed to fetch WETH balance:', error);
        setWethBalance('0');
      }
    }
  }, [ethAccount, ethSigner]);


  // Fetch WETH balance only on initial mount and status changes
  useEffect(() => {
    fetchWethBalance();
  }, [fetchWethBalance, swapStatus.stage]); // Re-fetch when swap status changes


  // Auto-select WETH if user has WETH balance but no ETH
  useEffect(() => {
    if (fromChain === Chain.ETHEREUM && parseFloat(wethBalance) > 0 && parseFloat(ethBalance) < 0.01) {
      setSelectedToken('WETH');
    }
  }, [fromChain, wethBalance, ethBalance]);

  // Close token menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showTokenDropdown && !(e.target as HTMLElement).closest('.token-select')) {
        setShowTokenDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showTokenDropdown]);

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
          {ethAccount && aptosAccount && (
            <button 
              className="resolver-status-button"
              onClick={fetchResolverStatus}
              title="Show Resolver Wallet Status"
            >
              🏛️ Resolver Status
            </button>
          )}
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
            <div className="token-select" onClick={() => fromChain === Chain.ETHEREUM && setShowTokenDropdown(!showTokenDropdown)}>
              <img 
                className="token-icon" 
                src={fromChain === Chain.ETHEREUM 
                  ? TOKEN_ICONS[selectedToken]
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
              {showTokenDropdown && fromChain === Chain.ETHEREUM && (
                <div className="token-menu">
                  <div 
                    className={`token-option ${selectedToken === 'ETH' ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Show wrap interface when ETH is selected
                      setShowWrapInterface(true);
                      setShowTokenDropdown(false);
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
                      setShowTokenDropdown(false);
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
              ≈ ${(() => {
                const amount = parseFloat(fromAmount);
                if (fromChain === Chain.ETHEREUM) {
                  return (amount * ethPrice).toFixed(2);
                }
                return (amount * aptPrice).toFixed(2);
              })()}
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
                src={toChain === Chain.ETHEREUM ? 
                  (fromChain === Chain.APTOS ? TOKEN_ICONS.WETH : TOKEN_ICONS.ETH) : 
                  TOKEN_ICONS.APT
                }
                alt={toChain === Chain.ETHEREUM ? 
                  (fromChain === Chain.APTOS ? 'WETH' : 'ETH') : 
                  'APT'
                }
              />
              <span className="token-symbol">
                {toChain === Chain.ETHEREUM ? 
                  (fromChain === Chain.APTOS ? 'WETH' : 'ETH') : 
                  'APT'
                }
              </span>
            </div>
            <input
              type="number"
              className="amount-input"
              placeholder="0.0"
              value={estimatedOutput ? parseFloat(estimatedOutput).toFixed(toChain === Chain.ETHEREUM ? 6 : 8) : ''}
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
                  <small>
                    {fromChain === Chain.APTOS 
                      ? 'Please approve the APT escrow transaction in your Aptos wallet...'
                      : 'The resolver will complete the swap automatically.'}
                  </small>
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

    {/* ETH to WETH Wrap Interface */}
    {showWrapInterface && (
      <div className="modal-overlay" onClick={() => setShowWrapInterface(false)}>
        <div className="wrap-interface" onClick={(e) => e.stopPropagation()}>
          <div className="wrap-header">
            <button 
              className="back-button"
              onClick={() => setShowWrapInterface(false)}
            >
              ← Back
            </button>
            <h2>Wrap ETH</h2>
            <div className="wrap-info">
              <p>To continue, wrap your ETH to WETH via an on-chain ERC20 transaction.</p>
            </div>
          </div>

          <div className="wrap-content">
            <div className="wrap-token-row">
              <div className="wrap-token-info">
                <img src={TOKEN_ICONS.ETH} alt="ETH" className="wrap-token-icon" />
                <div className="wrap-token-details">
                  <span className="wrap-token-symbol">ETH</span>
                  <span className="wrap-token-network">on Ethereum</span>
                </div>
              </div>
              <div className="wrap-token-balance">
                <input
                  type="number"
                  className="wrap-amount-input"
                  placeholder="0.0"
                  value={wrapAmount}
                  onChange={(e) => setWrapAmount(e.target.value)}
                />
                <div className="wrap-balance-info">
                  <span className="wrap-balance">
                    {ethBalance}
                    {parseFloat(ethBalance) > 0 && (
                      <span 
                        className="max-button" 
                        style={{ marginLeft: '8px', cursor: 'pointer' }}
                        onClick={() => setWrapAmount(ethBalance)}
                      >
                        MAX
                      </span>
                    )}
                  </span>
                  <span className="wrap-balance-usd">~${(parseFloat(ethBalance) * ethPrice).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="wrap-arrow">↓</div>

            <div className="wrap-token-row">
              <div className="wrap-token-info">
                <img src={TOKEN_ICONS.WETH} alt="WETH" className="wrap-token-icon" />
                <div className="wrap-token-details">
                  <span className="wrap-token-symbol">WETH</span>
                  <span className="wrap-token-network">on Ethereum</span>
                </div>
              </div>
              <div className="wrap-token-balance">
                <div className="wrap-output">{wrapAmount || '0.0'}</div>
                <div className="wrap-balance-info">
                  <span className="wrap-balance">{parseFloat(wethBalance).toFixed(6)}</span>
                  <span className="wrap-balance-usd">~${(parseFloat(wethBalance) * ethPrice).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="wrap-fee-info">
              <span>Network Fee</span>
              <span className="wrap-fee">~$1.37</span>
            </div>

            <div className="wrap-notes">
              <div className="wrap-note">
                <span className="wrap-note-number">1</span>
                <span>It is required to give a one-time approval of WETH via an on-chain ERC20 Approve transaction.</span>
              </div>
              <div className="wrap-note">
                <span className="wrap-note-number">2</span>
                <span>Confirm swap WETH to APT</span>
              </div>
            </div>

            <button 
              className="wrap-button"
              onClick={async () => {
                if (!wrapAmount || parseFloat(wrapAmount) <= 0) {
                  alert('Please enter amount to wrap');
                  return;
                }
                
                setIsWrapping(true);
                try {
                  const wethService = new WETHService(ethSigner!);
                  const amountWei = ethers.parseEther(wrapAmount);
                  
                  console.log(`Wrapping ${wrapAmount} ETH to WETH...`);
                  const txHash = await wethService.wrapETH(amountWei.toString());
                  console.log(`Wrap transaction: ${txHash}`);
                  
                  // Wait a bit and refresh balances
                  setTimeout(() => {
                    fetchWethBalance();
                    window.dispatchEvent(new Event('refreshBalances'));
                  }, 3000);
                  
                  // Switch to WETH and close wrap interface
                  setSelectedToken('WETH');
                  setFromAmount(wrapAmount);
                  setShowWrapInterface(false);
                  setWrapAmount('');
                  
                  alert(`Successfully wrapped ${wrapAmount} ETH to WETH!`);
                } catch (error) {
                  console.error('Failed to wrap ETH:', error);
                  alert('Failed to wrap ETH. Please try again.');
                } finally {
                  setIsWrapping(false);
                }
              }}
              disabled={isWrapping || !wrapAmount || parseFloat(wrapAmount) <= 0 || parseFloat(wrapAmount) > parseFloat(ethBalance)}
            >
              {isWrapping ? 'Wrapping...' : 'Wrap ETH to WETH'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

export default SwapInterface;