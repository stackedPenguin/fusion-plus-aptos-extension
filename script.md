# Fusion+ Aptos Extension - Technical Demo Script

## Opening (15 seconds)

Hi. We've implemented the Fusion+ protocol for cross-chain swaps between Ethereum and Aptos. Our focus was on following the existing protocol specification while adding gasless execution through meta-transactions.

Let me walk you through the technical implementation.

## Technical Architecture (45 seconds)

We implement the standard Fusion+ four phases. In the announcement phase, users generate a 32-byte secret and compute its Keccak256 hash. They sign an EIP-712 structured message containing the swap parameters and secret hash.

For the deposit phase, our resolver creates HTLCs on both chains. On Ethereum, we deploy a gasless escrow contract that accepts meta-transactions. On Aptos, we use Move modules with sponsored transaction capabilities.

The key technical challenge was maintaining hash compatibility. Ethereum uses Keccak256 natively, but Aptos doesn't have this built-in. We implemented a verification mechanism that ensures the same secret unlocks both escrows.

## Implementation: ETH → APT Direction (30 seconds)

For ETH to APT swaps, the gasless magic happens on the source chain. The user signs an EIP-712 typed message containing swap parameters and secret hash. This is just a signature - no transaction.

The resolver then calls `executeWithPermit` on our Ethereum escrow contract, passing the user's signature. The contract recovers the signer, validates the parameters, and transfers WETH from the user to the escrow - all without the user spending ETH.

On the Aptos side, it's straightforward. The resolver creates and funds the destination escrow normally, locking APT for the user.

## Implementation: APT → ETH Direction (30 seconds)

APT to ETH swaps use a different approach. Here, we implement multi-agent transaction signing on Aptos. The resolver constructs a transaction that transfers APT from the user to the escrow.

The user signs this transaction, but crucially, the resolver acts as the fee payer using Aptos's sponsored transaction pattern. This requires careful transaction builder handling - we set the fee payer to the resolver while the sender remains the user.

On Ethereum, the resolver creates the WETH escrow normally, paying gas themselves. The key difference is where the gasless execution happens - source chain for ETH→APT, destination chain considerations for APT→ETH.

## Cross-Chain Coordination & Secret Management (25 seconds)

Both directions support partial fills using Merkle trees. We generate N+1 secrets - for 3 resolvers, that's 4 secrets controlling 33%, 66%, 100%, and overflow. Each resolver receives only their specific secret through WebSocket after escrow finality.

We've integrated LayerZero V2 for cross-chain message verification. When secrets are revealed on one chain, LayerZero adapters coordinate the information across chains, ensuring both escrows can be unlocked atomically.

The secret relay waits for blockchain finality - 64 blocks on Ethereum, instant on Aptos. This prevents reorg attacks where escrows could disappear.

## Live Demo: ETH → APT (45 seconds)

Let me demonstrate ETH to APT. I have 0.003418 WETH and zero ETH for gas.

*[Show balances and initiate swap]*

Watch the network tab - I'm signing an EIP-712 message, not a transaction. The signature contains the escrow parameters and secret hash.

*[Show signature details]*

The resolver creates the Aptos escrow first, then calls our gasless escrow on Ethereum with my signature. No ETH required from me.

*[Show completion]*

## Live Demo: APT → ETH (45 seconds)

Now the reverse direction. I'll swap APT to WETH.

*[Initiate APT to ETH swap]*

This time I'm signing an Aptos transaction. The resolver constructed it with themselves as fee payer. Watch - I pay no APT for gas.

*[Show transaction structure]*

The resolver sponsors the transaction on Aptos, creates the WETH escrow on Ethereum, and the atomic swap completes. Again, zero gas from the user.

## Technical Challenges (30 seconds)

Three main challenges:

First, signature schemes. Ethereum uses ECDSA with secp256k1, Aptos uses Ed25519. We handle this by having separate signing flows but ensuring both produce compatible escrow parameters.

Second, decimal precision. WETH has 18 decimals, APT has 8. We implemented careful conversion logic to prevent rounding errors that could break atomicity.

Third, hash function availability. We needed Keccak256 on both chains for compatible hashlocks. On Aptos, we verify the hash off-chain and pass the result to the Move module.

## Code Architecture (30 seconds)

The codebase has five main components:

1. Smart contracts - Solidity escrow with EIP-712 support, Move module with sponsored transactions
2. LayerZero adapters - Cross-chain message coordination for secret reveals
3. Order engine - Manages intents, broadcasts via WebSocket
4. Resolver service - Three instances with different strategies for Dutch auction competition  
5. Frontend - React with ethers.js and Aptos SDK integration

Everything runs locally for the demo. The contracts are deployed on Sepolia and Aptos testnet.

## Closing (10 seconds)

That's our implementation. We've shown that Fusion+ can work across non-EVM chains with gasless execution. The code is open source.

Thank you.

---

## Demo Backup Notes

If demo fails:
- Show transaction history proving gasless execution
- Explain the cryptographic flow with the diagram
- Highlight deployed contract addresses

Key points to emphasize:
- User pays ZERO gas (not subsidized, truly gasless)
- Atomic swaps (no trust required)
- Production-ready with economic incentives

Remember to:
- Stay calm and speak clearly
- Point to specific UI elements during demo
- Pause briefly between major points
- Thank judges at the end