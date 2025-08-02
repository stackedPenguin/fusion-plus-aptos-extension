import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { OrderService, Chain } from '../services/OrderService';
import { PriceService } from '../services/PriceService';
import { WETHService } from '../services/WETHService';
import { AssetFlowLogger } from '../services/AssetFlowLogger';
import { CONTRACTS } from '../config/contracts';
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  SimpleTransaction,
  Ed25519PublicKey,
  Ed25519Signature,
  AccountAuthenticatorEd25519
} from '@aptos-labs/ts-sdk';
import { ApprovalBanner } from './ApprovalBanner';
import { SponsoredTransactionV3 } from '../utils/sponsoredTransactionV3';
import { GaslessWETHTransaction } from '../utils/gaslessWETHTransaction';
import './SwapInterface.css';

// Helper function to convert Uint8Array to hex string
function toHex(uint8array: Uint8Array): string {
  return Array.from(uint8array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface SwapInterfaceProps {
  ethAccount: string | null;
  aptosAccount: string | null;
  ethSigner: ethers.Signer | null;
  orderService: OrderService;
  ethBalance: string;
  aptosBalance: string;
}

const TOKEN_ICONS = {
  WETH: 'https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
  APT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/21794.png'
};

interface SwapStatus {
  stage: 'idle' | 'signing_intent' | 'submitting' | 'waiting' | 'escrow_created' | 'signing_tx' | 'processing' | 'claiming' | 'completed' | 'error';
  message: string;
  orderId?: string;
  secretHash?: string;
}

const SwapInterface: React.FC<SwapInterfaceProps> = ({
  ethAccount,
  aptosAccount,
  ethSigner,
  orderService,
  ethBalance,
  aptosBalance
}) => {
  const { signTransaction, signMessage } = useWallet();
  const [fromChain, setFromChain] = useState<Chain>(Chain.ETHEREUM);
  const [toChain, setToChain] = useState<Chain>(Chain.APTOS);
  const [fromAmount, setFromAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [priceService] = useState(() => new PriceService());
  const [swapStatus, setSwapStatus] = useState<SwapStatus>({ stage: 'idle', message: '' });
  const [estimatedOutput, setEstimatedOutput] = useState<string>('');
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [aptPrice, setAptPrice] = useState<number>(0);
  const [wethBalance, setWethBalance] = useState<string>('0');
  const [partialFillAllowed, setPartialFillAllowed] = useState<boolean>(false);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [partialFills, setPartialFills] = useState<any[]>([]);

  // Get current balances
  const currentBalances = {
    [Chain.ETHEREUM]: wethBalance,
    [Chain.APTOS]: aptosBalance
  };

  const fromBalance = currentBalances[fromChain];
  const toBalance = currentBalances[toChain];

  // Fetch WETH balance
  useEffect(() => {
    const fetchWethBalance = async () => {
      if (ethAccount && ethSigner) {
        try {
          const wethService = new WETHService(ethSigner);
          const balance = await wethService.getBalance(ethAccount);
          setWethBalance(ethers.formatEther(balance));
        } catch (error) {
          console.error('Failed to fetch WETH balance:', error);
        }
      }
    };
    fetchWethBalance();
  }, [ethAccount, ethSigner, ethBalance]);

  // Fetch exchange rates
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const [wethRate, aptRate] = await Promise.all([
          priceService.getUSDPrice('ETH'),
          priceService.getUSDPrice('APT')
        ]);
        setEthPrice(wethRate);
        setAptPrice(aptRate);
        
        if (fromChain === Chain.ETHEREUM) {
          setExchangeRate(wethRate / aptRate);
        } else {
          setExchangeRate(aptRate / wethRate);
        }
      } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
      }
    };
    fetchRates();
    const interval = setInterval(fetchRates, 30000);
    return () => clearInterval(interval);
  }, [fromChain, priceService]);

  // Update estimated output when amount changes
  useEffect(() => {
    if (fromAmount && exchangeRate) {
      const amount = parseFloat(fromAmount);
      if (!isNaN(amount)) {
        const output = amount * exchangeRate;
        setEstimatedOutput(output.toFixed(6));
      }
    } else {
      setEstimatedOutput('');
    }
  }, [fromAmount, exchangeRate]);

  const switchChains = () => {
    setFromChain(toChain);
    setToChain(fromChain);
    setFromAmount('');
    setEstimatedOutput('');
  };

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
    
    // Log pre-swap state
    logger.logPreSwapState(
      fromAmount, 
      fromChain === Chain.APTOS ? 'APT' : 'WETH', 
      fromChain === Chain.APTOS ? 'APTOS' : 'ETHEREUM'
    ).catch(err => console.error('Failed to log pre-swap state:', err));
    
    try {
      // Handle different decimals
      let swapAmount: string;
      if (fromChain === Chain.ETHEREUM) {
        swapAmount = ethers.parseEther(fromAmount).toString();
      } else {
        swapAmount = (parseFloat(fromAmount) * 1e8).toString();
      }
      
      // Generate secret for the swap
      const secret = ethers.randomBytes(32);
      const secretHash = ethers.keccak256(secret);
      
      // Store secret for later reveal
      (window as any).__fusionPlusSecret = {
        secret: ethers.hexlify(secret),
        secretHash,
        orderId: null,
        revealed: false
      };
      
      // Generate partial fill secrets if enabled
      let partialFillSecrets = null;
      if (partialFillAllowed) {
        // Import the secrets manager (you'll need to add this import at the top)
        const { PartialFillSecretsManager } = await import('../utils/partialFillSecrets');
        partialFillSecrets = PartialFillSecretsManager.generateSecrets(4); // 4 parts = 25% each
      }

      // Build order data
      const orderData = {
        fromChain,
        toChain,
        fromToken: fromChain === Chain.ETHEREUM 
          ? CONTRACTS.ETHEREUM.WETH
          : '0x1::aptos_coin::AptosCoin',
        toToken: toChain === Chain.ETHEREUM 
          ? CONTRACTS.ETHEREUM.WETH
          : '0x1::aptos_coin::AptosCoin',
        fromAmount: swapAmount,
        minToAmount: toChain === Chain.ETHEREUM
          ? ethers.parseEther((parseFloat(estimatedOutput) * 0.995).toFixed(18)).toString()
          : Math.floor(parseFloat(estimatedOutput) * 1e8 * 0.995).toString(),
        maker: fromChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        receiver: toChain === Chain.ETHEREUM ? ethAccount : aptosAccount,
        deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        nonce: Date.now().toString(),
        partialFillAllowed,
        secretHash,
        // Add partial fill data if enabled
        ...(partialFillAllowed && partialFillSecrets && {
          partialFillSecrets,
          maxParts: 4
        })
      };

      let finalOrderData: any;
      let signature: string;

      if (fromChain === Chain.ETHEREUM) {
        // For WETH -> APT, use gasless meta-transaction
        setSwapStatus({ stage: 'signing_intent', message: '✨ Signing gasless WETH transfer...' });
        await logger.logSwapStep('✨ True Gasless WETH Swap', 'You only sign, resolver pays gas');
        
        // Check if gasless escrow is deployed (you'll need to add this config)
        const gaslessEscrowAddress = CONTRACTS.ETHEREUM.GASLESS_ESCROW || '';
        if (!gaslessEscrowAddress) {
          // Fallback to regular flow
          signature = await orderService.signOrder(orderData, ethSigner);
          finalOrderData = { ...orderData, signature };
        } else {
          // Check if user has approved WETH to gasless escrow
          const wethContract = new ethers.Contract(
            CONTRACTS.ETHEREUM.WETH,
            [
              'function allowance(address owner, address spender) view returns (uint256)',
              'function approve(address spender, uint256 amount) returns (bool)'
            ],
            ethSigner.provider
          );
          
          let allowance = await wethContract.allowance(ethAccount, gaslessEscrowAddress);
          let userApprovedInThisSession = false;
          
          if (allowance < BigInt(swapAmount)) {
            console.log('🔐 User needs to approve WETH to gasless escrow first');
            const confirmApproval = window.confirm(
              'To enable gasless swaps, you need to approve WETH spending (one-time setup).\n\n' +
              'This will require one transaction with gas.\n' +
              'After this, all future swaps will be gasless!\n\n' +
              'Approve now?'
            );
            
            if (confirmApproval) {
              try {
                setSwapStatus({ stage: 'signing_intent', message: '🔐 Approving WETH for gasless swaps...' });
                const wethWithSigner = wethContract.connect(ethSigner) as any;
                const approveTx = await wethWithSigner.approve(gaslessEscrowAddress, ethers.MaxUint256);
                
                setSwapStatus({ stage: 'signing_intent', message: '⏳ Waiting for approval confirmation...' });
                await approveTx.wait();
                
                console.log('✅ WETH approved for gasless swaps!');
                setSwapStatus({ stage: 'signing_intent', message: '✅ WETH approved! Continuing with gasless swap...' });
                
                // Small delay to ensure state updates
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Re-check allowance after approval
                allowance = await wethContract.allowance(ethAccount, gaslessEscrowAddress);
                userApprovedInThisSession = true;
              } catch (error) {
                console.error('Approval failed:', error);
                alert('Approval failed. Please try again.');
                setIsLoading(false);
                return;
              }
            } else {
              alert('Gasless swaps require WETH approval. Using regular flow instead.');
              // Fallback to regular flow
              signature = await orderService.signOrder(orderData, ethSigner);
              finalOrderData = { ...orderData, signature };
            }
          }
          
          if (allowance >= BigInt(swapAmount) || allowance === ethers.MaxUint256) {
            // Use gasless meta-transaction
            const gaslessTx = new GaslessWETHTransaction(
              await ethSigner.provider!,
              gaslessEscrowAddress,
              11155111 // Sepolia chain ID
            );
            
            // Prepare escrow parameters
            const sourceEscrowId = ethers.id(orderData.nonce + '-source-' + secretHash);
            const escrowParams = {
              escrowId: ethers.getBytes(sourceEscrowId),
              depositor: ethAccount,
              beneficiary: CONTRACTS.RESOLVER.ETHEREUM,
              token: CONTRACTS.ETHEREUM.WETH,
              amount: orderData.fromAmount,
              hashlock: ethers.getBytes(secretHash),
              timelock: orderData.deadline,
              gaslessEscrowAddress
            };
            
            // Sign meta-transaction (no gas)
            const { signature: metaTxSig, deadline } = await gaslessTx.signMetaTx(
              ethSigner,
              escrowParams
            );
            
            // Store the gasless transaction data
            (window as any).__fusionPlusGaslessTx = {
              escrowParams,
              metaTxSignature: metaTxSig,
              deadline,
              orderId: null
            };
            
            // Create order with gasless flag
            signature = '0x00'; // Deferred for gasless
            finalOrderData = {
              ...orderData,
              signature,
              gasless: true,
              gaslessData: gaslessTx.prepareGaslessEscrowData(escrowParams, metaTxSig, deadline)
            };
          } else if (!finalOrderData) {
            // Fallback to regular order if gasless didn't work
            signature = await orderService.signOrder(orderData, ethSigner);
            finalOrderData = { ...orderData, signature };
          }
        }
        
      } else if (fromChain === Chain.APTOS) {
        // For APT -> ETH, sign the Fusion+ intent
        setSwapStatus({ stage: 'signing_intent', message: 'Signing Fusion+ intent...' });
        await logger.logSwapStep('🔏 Signing Fusion+ intent', 'Creating gasless swap order');
        
        const now = Math.floor(Date.now() / 1000);
        const expiry = now + 300;
        const nonce = Date.now();
        
        // Create order message for escrow
        const sourceEscrowId = ethers.id(orderData.nonce + '-source-' + secretHash);
        const orderMessage = {
          escrow_id: Array.from(ethers.getBytes(sourceEscrowId)),
          depositor: aptosAccount,
          beneficiary: CONTRACTS.RESOLVER.APTOS,
          amount: orderData.fromAmount,
          hashlock: Array.from(ethers.getBytes(secretHash)),
          timelock: orderData.deadline,
          nonce: nonce,
          expiry: expiry
        };
        
        // Sign with Petra
        const readableMessage = `Fusion+ Swap Order:
From: ${(parseInt(orderData.fromAmount) / 100000000).toFixed(4)} APT
To: ${estimatedOutput} WETH
Resolver: ${CONTRACTS.RESOLVER.APTOS}
Order ID: ${orderData.nonce}
Expires: ${new Date(expiry * 1000).toLocaleString()}`;
        
        let signatureResponse;
        
        // Try the wallet adapter first (works with any connected wallet including Rise)
        if (signMessage) {
          try {
            console.log('Using wallet adapter for message signing');
            signatureResponse = await signMessage({
              message: readableMessage,
              nonce: nonce.toString()
            });
            console.log('Wallet adapter signature response:', signatureResponse);
          } catch (error: any) {
            console.error('Wallet adapter signMessage failed:', error);
            // Continue to try direct wallet methods
          }
        }
        
        // Fallback to direct wallet methods if adapter fails
        if (!signatureResponse) {
          // Try different wallets for message signing
          if ((window as any).pontem?.signMessage) {
            console.log('Using Pontem for message signing');
            signatureResponse = await (window as any).pontem.signMessage({
              message: readableMessage,
              nonce: nonce.toString()
            });
          } else if ((window as any).petra?.signMessage) {
            console.log('Using Petra for message signing');
            signatureResponse = await (window as any).petra.signMessage({
              message: readableMessage,
              nonce: nonce.toString()
            });
          } else if ((window as any).rise?.signMessage) {
            console.log('Using Rise for message signing');
            signatureResponse = await (window as any).rise.signMessage({
              message: readableMessage,
              nonce: nonce.toString()
            });
          } else if ((window as any).aptos?.signMessage) {
            console.log('Using Aptos adapter for message signing');
            signatureResponse = await (window as any).aptos.signMessage({
              message: readableMessage,
              nonce: nonce.toString()
            });
          } else {
            throw new Error('No wallet available for message signing. Please make sure your wallet is connected.');
          }
        }
        
        console.log('✅ Intent signed!', signatureResponse);
        
        // Store signed intent for later use
        (window as any).__fusionPlusIntent = {
          orderMessage,
          signature: signatureResponse.signature,
          publicKey: signatureResponse.publicKey,
          fullMessage: signatureResponse.fullMessage || readableMessage,
          nonce
        };
        
        signature = '0x00'; // Deferred for Aptos
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

      // Store order data and set current order for partial fill tracking
      const currentOrderData = orderData;
      setCurrentOrder({ ...orderData, id: orderId });
      
      // Subscribe to order updates
      orderService.subscribeToOrderUpdates(orderId, async (update: any) => {
        console.log('Order update:', update);
      });

      // Listen for escrow events
      const socket = (orderService as any).socket;
      
      // Handle destination escrow creation
      socket.on('escrow:destination:created', async (data: any) => {
        console.log('📦 Destination escrow created:', data);
        if (data.orderId === orderId) {
          const amount = data.chain === 'APTOS' 
            ? (parseInt(data.amount || '0') / 100000000).toFixed(4) + ' APT'
            : ethers.formatEther(data.amount || '0') + ' WETH';
          
          await logger.logSwapStep(
            `🔒 Destination escrow created on ${data.chain}`,
            `Resolver locked ${amount}`
          );
          
          setSwapStatus({
            stage: 'escrow_created',
            message: `Resolver locked ${amount} on ${data.chain}!`,
            orderId,
            secretHash: data.secretHash
          });
          
          // For APT -> WETH swaps, automatically sign APT escrow transaction
          if (fromChain === Chain.APTOS && data.chain === 'ETHEREUM') {
            console.log('🔄 Triggering gasless APT escrow creation...');
            
            const signedIntent = (window as any).__fusionPlusIntent;
            if (!signedIntent) {
              throw new Error('No signed intent found');
            }
            
            // Update timelock from destination escrow
            signedIntent.orderMessage.timelock = data.timelock;
            
            setTimeout(async () => {
              try {
                setSwapStatus({ stage: 'signing_tx', message: '✨ Signing gasless transaction (ignore wallet gas display)...' });
                await logger.logSwapStep('✨ True Gasless Swap', 'You only sign, resolver pays gas');
                
                // 1. Use the new sponsored transaction pattern (Shinami-style)
                const sponsoredTx = new SponsoredTransactionV3(Network.TESTNET);
                
                // 2. Build the transaction - regular transaction, NOT multi-agent
                const rawTransaction = await sponsoredTx.buildSponsoredEscrowTransaction(
                  currentOrderData.maker,
                  {
                    escrowId: signedIntent.orderMessage.escrow_id,
                    depositor: currentOrderData.maker,
                    beneficiary: currentOrderData.maker, // beneficiary is the maker (they receive funds back if refunded)
                    amount: currentOrderData.fromAmount,
                    hashlock: signedIntent.orderMessage.hashlock,
                    timelock: signedIntent.orderMessage.timelock,
                    safetyDeposit: '100000',
                    resolverAddress: CONTRACTS.RESOLVER.APTOS
                  }
                );
                
                // Debug: Check the transaction structure
                console.log("Built raw transaction:", rawTransaction);
                console.log("Transaction type:", rawTransaction.constructor.name);
                console.log("Has fee payer?", rawTransaction.feePayerAddress !== undefined);
                if (rawTransaction.feePayerAddress) {
                  console.log("Fee payer address:", rawTransaction.feePayerAddress);
                }
                
                await logger.logSwapStep('🔐 Sign transaction', 'Just signing, NOT submitting');
                
                // 3. Sign with the wallet adapter - this WILL work with Pontem and other wallets!
                let userAuthenticator;
                console.log("Attempting to sign sponsored transaction (Shinami pattern)...");
                console.log("This should work with Pontem, Petra, and other wallets!");
                
                // Use the wallet adapter's signTransaction method
                try {
                  console.log("Using wallet adapter to sign transaction...");
                  
                  // Check if wallet supports signTransaction
                  if (!signTransaction) {
                    console.warn("Wallet adapter doesn't provide signTransaction method");
                    throw new Error("Wallet does not support signing transactions separately");
                  }
                  
                  // The wallet adapter expects the transaction object directly
                  userAuthenticator = await signTransaction(rawTransaction);
                  
                  console.log("✅ Transaction signed successfully with wallet adapter!");
                  
                  // Show user-friendly message
                  await logger.logSwapStep(
                    '✅ Transaction Signed!', 
                    'Your wallet signed the transaction. The resolver will pay all gas fees!'
                  );
                  
                } catch (err: any) {
                  console.error("Wallet adapter signing failed:", err);
                  
                  // Fallback to direct wallet methods if adapter fails
                  console.log("Trying direct wallet methods...");
                  
                  // For Pontem, we need to use their specific API format
                  if ((window as any).pontem) {
                    console.log("Trying Pontem direct API...");
                    try {
                      // Extract the payload from the transaction for Pontem's API
                      const payload = {
                        function: `${CONTRACTS.APTOS.ESCROW}::escrow_v2::create_escrow_user_funded`,
                        type_arguments: [],
                        arguments: [
                          Array.from(signedIntent.orderMessage.escrow_id),
                          currentOrderData.maker,
                          currentOrderData.fromAmount,
                          Array.from(signedIntent.orderMessage.hashlock),
                          signedIntent.orderMessage.timelock.toString(),
                          '100000',
                          CONTRACTS.RESOLVER.APTOS
                        ]
                      };
                      
                      // Pontem's signTransaction expects payload + options
                      const options = {
                        sender: currentOrderData.maker,
                        max_gas_amount: 20000,
                        gas_unit_price: 100,
                        expiration_timestamp_secs: Math.floor(Date.now() / 1000) + 120 // 2 minutes
                      };
                      
                      console.log("Calling Pontem signTransaction with payload:", payload);
                      console.log("Options:", options);
                      
                      const pontemResult = await (window as any).pontem.signTransaction(payload, options);
                      console.log("Pontem signTransaction result:", pontemResult);
                      
                      // Pontem returns the signed transaction differently
                      // We need to construct the authenticator from the result
                      if (pontemResult) {
                        // For now, we'll need to handle Pontem's response format
                        // This is a limitation - Pontem doesn't return signature in a format we can use for sponsorship
                        throw new Error("Pontem wallet returns transaction in incompatible format for sponsorship");
                      }
                    } catch (pontemErr: any) {
                      console.error("Pontem signing failed:", pontemErr);
                    }
                  }
                  
                  // Try other wallets
                  const wallets = [
                    { name: 'Petra', obj: (window as any).petra },
                    { name: 'Rise', obj: (window as any).rise }
                  ];
                  
                  for (const wallet of wallets) {
                    if (!userAuthenticator && wallet.obj && wallet.obj.signTransaction) {
                      console.log(`Trying ${wallet.name} directly...`);
                      try {
                        // Try with the transaction object
                        const response = await wallet.obj.signTransaction(rawTransaction);
                        
                        // Validate the response
                        if (response && response.signature && response.publicKey) {
                          // Create authenticator from response
                          userAuthenticator = new AccountAuthenticatorEd25519(
                            new Ed25519PublicKey(response.publicKey),
                            new Ed25519Signature(response.signature)
                          );
                          console.log(`✅ Transaction signed with ${wallet.name}`);
                          break;
                        }
                      } catch (walletErr: any) {
                        console.error(`${wallet.name} signing failed:`, walletErr);
                      }
                    }
                  }
                }
                
                if (!userAuthenticator) {
                  await logger.logSwapStep(
                    '❌ Wallet Limitation',
                    'Pontem wallet doesn\'t support gasless sponsored transactions yet.'
                  );
                  throw new Error(
                    'Sponsored transaction signing failed.\n\n' +
                    'Unfortunately, Pontem wallet doesn\'t support signing transactions for sponsorship.\n\n' +
                    'Wallet support status:\n' +
                    '• Petra: ✅ Supports sponsored transactions\n' +
                    '• Pontem: ❌ Only supports signAndSubmit (no sponsorship)\n' +
                    '• Rise: ❌ Limited support\n\n' +
                    'Please use Petra wallet for gasless swaps, or wait for Pontem to add sponsorship support.'
                  );
                }
                
                // 4. Serialize and send to the resolver
                const serializedData = sponsoredTx.serializeTransactionForResolver(
                  rawTransaction,
                  userAuthenticator
                );
                
                await logger.logSwapStep('📤 Sending to resolver', 'Resolver will pay gas and submit');
                
                // Send to resolver for fee payer signature and submission
                socket.emit('order:signed:sponsored:v3', {
                  orderId: data.orderId,
                  orderMessage: signedIntent.orderMessage,
                  signature: signedIntent.signature,
                  publicKey: signedIntent.publicKey,
                  fullMessage: signedIntent.fullMessage,
                  fromChain: 'APTOS',
                  toChain: 'ETHEREUM',
                  fromAmount: currentOrderData.fromAmount,
                  toAmount: currentOrderData.minToAmount,
                  secretHash: (window as any).__fusionPlusSecret?.secretHash || data.secretHash,
                  sponsoredTransaction: serializedData
                });
                
                setSwapStatus({
                  stage: 'processing',
                  message: 'Resolver submitting transaction...',
                  orderId: data.orderId
                });
                
                await logger.logSwapStep('⏳ Waiting for resolver', 'Resolver is submitting your transaction');
                
              } catch (error: any) {
                console.error('Failed to sign transaction:', error);
                setSwapStatus({
                  stage: 'error',
                  message: `❌ ${error.message}`,
                  orderId: data.orderId
                });
              }
            }, 1000);
          }
        }
      });

      // Listen for source escrow creation
      socket.on('escrow:source:created', async (data: any) => {
        if (data.orderId === orderId) {
          const amount = fromChain === Chain.ETHEREUM
            ? `${ethers.formatEther(data.amount || '0')} WETH`
            : `${(parseInt(data.amount || '0') / 100000000).toFixed(4)} APT`;
            
          await logger.logSwapStep('🔒 Source escrow created', `Your ${amount} is locked`);
          
          // Reveal secret after both escrows are created
          if ((window as any).__fusionPlusSecret && !((window as any).__fusionPlusSecret.revealed)) {
            (window as any).__fusionPlusSecret.revealed = true;
            
            setTimeout(() => {
              console.log('🔓 Revealing secret to resolver...');
              socket.emit('secret:reveal', {
                orderId,
                secret: (window as any).__fusionPlusSecret.secret,
                secretHash: (window as any).__fusionPlusSecret.secretHash
              });
              
              setSwapStatus({
                stage: 'claiming',
                message: 'Secret revealed! Resolver completing swap...',
                orderId
              });
            }, 2000);
          }
        }
      });

      // Listen for swap completion
      socket.on('swap:completed', async (data: any) => {
        if (data.orderId === orderId) {
          await logger.logSwapStep('✅ Swap completed!', 'Check your destination wallet');
          setSwapStatus({
            stage: 'completed',
            message: '✅ Swap completed successfully!',
            orderId
          });
          setIsLoading(false);
          
          // Refresh balances after swap completion
          if (ethAccount && aptosAccount) {
            console.log('Refreshing balances after swap completion...');
            
            // Refresh ETH/WETH balance
            if (data.destinationChain === 'ETHEREUM' || data.toChain === 'ETHEREUM') {
              try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const wethService = new WETHService(signer, CONTRACTS.ETHEREUM.WETH);
                const wethBalance = await wethService.getBalance(ethAccount);
                const ethBalance = await provider.getBalance(ethAccount);
                
                console.log('Updated WETH balance:', ethers.formatEther(wethBalance));
                console.log('Updated ETH balance:', ethers.formatEther(ethBalance));
                
                // Update parent component's balance through callback if available
                if ((window as any).__updateBalances) {
                  (window as any).__updateBalances();
                }
              } catch (error) {
                console.error('Failed to refresh ETH/WETH balance:', error);
              }
            }
            
            // Refresh APT balance
            if (data.destinationChain === 'APTOS' || data.toChain === 'APTOS') {
              try {
                const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    function: '0x1::coin::balance',
                    type_arguments: ['0x1::aptos_coin::AptosCoin'],
                    arguments: [aptosAccount]
                  })
                });
                if (response.ok) {
                  const balance = await response.json();
                  console.log('Updated APT balance:', (parseInt(balance) / 100000000).toFixed(6));
                }
              } catch (error) {
                console.error('Failed to refresh APT balance:', error);
              }
            }
          }
          
          // Reset form
          setTimeout(() => {
            setFromAmount('');
            setEstimatedOutput('');
            setSwapStatus({ stage: 'idle', message: '' });
          }, 5000);
        }
      });

      // Listen for errors
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

      // Handle partial fill events
      socket.on('partial:fill:created', (data: any) => {
        if (data.orderId === orderId) {
          console.log('🧩 Partial fill created:', data);
          setPartialFills(prev => [...prev, {
            resolver: data.resolver,
            fillPercentage: data.fillPercentage,
            secretIndex: data.secretIndex,
            status: 'PENDING',
            timestamp: Date.now()
          }]);
          
          setSwapStatus({
            stage: 'processing',
            message: `🧩 Partial fill: ${data.fillPercentage}% by resolver ${data.resolver.slice(0, 6)}...`,
            orderId
          });
        }
      });

      socket.on('partial:fill:completed', (data: any) => {
        if (data.orderId === orderId) {
          console.log('✅ Partial fill completed:', data);
          setPartialFills(prev => prev.map(fill => 
            fill.secretIndex === data.secretIndex 
              ? { ...fill, status: 'COMPLETED' }
              : fill
          ));
          
          const totalFilled = partialFills.reduce((sum, fill) => sum + fill.fillPercentage, 0) + data.fillPercentage;
          if (totalFilled >= 100) {
            setSwapStatus({
              stage: 'completed',
              message: '🎉 Swap completed via partial fills!',
              orderId
            });
            setIsLoading(false);
          } else {
            setSwapStatus({
              stage: 'processing',
              message: `🧩 ${totalFilled.toFixed(1)}% filled, waiting for more resolvers...`,
              orderId
            });
          }
        }
      });

    } catch (error: any) {
      console.error('Swap failed:', error);
      setSwapStatus({
        stage: 'error',
        message: `❌ ${error.message || 'Swap failed'}`,
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="swap-interface">
      <h2>True Gasless Swap (Fusion+ V2)</h2>
      
      {/* Show approval banner for WETH */}
      {fromChain === Chain.ETHEREUM && ethAccount && ethSigner && (
        <ApprovalBanner
          ethAccount={ethAccount}
          ethSigner={ethSigner}
          wethAddress={CONTRACTS.ETHEREUM.WETH}
          escrowAddress={CONTRACTS.ETHEREUM.ESCROW}
        />
      )}
      
      <div className="swap-box">
        <div className="swap-section">
          <div className="chain-label">From {fromChain}</div>
          <div className="token-input">
            <img src={fromChain === Chain.ETHEREUM ? TOKEN_ICONS.WETH : TOKEN_ICONS.APT} alt="" className="token-icon" />
            <input
              type="number"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              placeholder="0.0"
              className="amount-input"
            />
            <span className="token-symbol">{fromChain === Chain.ETHEREUM ? 'WETH' : 'APT'}</span>
          </div>
          <div className="balance">Balance: {fromBalance}</div>
        </div>

        <button onClick={switchChains} className="switch-button">⇅</button>

        <div className="swap-section">
          <div className="chain-label">To {toChain}</div>
          <div className="token-input">
            <img src={toChain === Chain.ETHEREUM ? TOKEN_ICONS.WETH : TOKEN_ICONS.APT} alt="" className="token-icon" />
            <input
              type="number"
              value={estimatedOutput}
              readOnly
              placeholder="0.0"
              className="amount-input"
            />
            <span className="token-symbol">{toChain === Chain.ETHEREUM ? 'WETH' : 'APT'}</span>
          </div>
          <div className="balance">Balance: {toBalance}</div>
        </div>

        {exchangeRate && (
          <div className="exchange-rate">
            1 {fromChain === Chain.ETHEREUM ? 'WETH' : 'APT'} = {exchangeRate.toFixed(4)} {toChain === Chain.ETHEREUM ? 'WETH' : 'APT'}
          </div>
        )}

        {/* Partial Fill Toggle */}
        <div className="partial-fill-section">
          <label className="partial-fill-toggle">
            <input
              type="checkbox"
              checked={partialFillAllowed}
              onChange={(e) => setPartialFillAllowed(e.target.checked)}
            />
            <span className="toggle-text">
              <div className="toggle-text-main">
                🧩 Allow Partial Fills
                <div className="info-button">
                  i
                  <div className="info-tooltip">
                    Enables multiple resolvers to fill portions of your order for better rates and faster execution. Your order can be split into up to 4 parts (25% each).
                  </div>
                </div>
              </div>
            </span>
          </label>
        </div>

        {/* Partial Fill Progress */}
        {currentOrder && partialFills.length > 0 && (
          <div className="partial-fill-progress">
            <div className="progress-header">
              <h4>Fill Progress</h4>
              <span className="fill-percentage">
                {partialFills.reduce((sum, fill) => sum + fill.fillPercentage, 0).toFixed(1)}% Complete
              </span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ 
                  width: `${partialFills.reduce((sum, fill) => sum + fill.fillPercentage, 0)}%`,
                  background: 'linear-gradient(90deg, #1dc872, #4ade80)'
                }}
              />
            </div>
            <div className="fills-list">
              {partialFills.map((fill, i) => (
                <div key={i} className="fill-item">
                  <div className="fill-info">
                    <span className="resolver">Resolver {fill.resolver.slice(0, 6)}...</span>
                    <span className="fill-amount">{fill.fillPercentage}%</span>
                  </div>
                  <div className="fill-status">
                    {fill.status === 'COMPLETED' ? '✅ Complete' : 
                     fill.status === 'PENDING' ? '⏳ Processing' : 
                     '🔄 Active'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="swap-button-container">
          <button
            onClick={handleSwap}
            disabled={isLoading || !fromAmount || !estimatedOutput}
            className={`swap-button ${isLoading ? 'loading' : ''}`}
          >
            {isLoading ? 'Processing...' : '🚀 Swap Now'}
          </button>
          <div className="info-button" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
            i
            <div className="info-tooltip" style={{ right: '0', left: 'auto', transform: 'none' }}>
              <strong>100% Gasless</strong> - You pay NO gas fees! The resolver pays all transaction costs.
              <br />
              <small style={{ opacity: 0.8 }}>Note: Wallets may display gas fees, but you won't be charged.</small>
            </div>
          </div>
        </div>

        {swapStatus.stage !== 'idle' && (
          <div className={`swap-status ${swapStatus.stage}`}>
            {swapStatus.message}
          </div>
        )}
      </div>

    </div>
  );
};

export default SwapInterface;