# FINAL PRODUCT REQUIREMENT DOCUMENT

## Goal
Build and demonstrate a cross-chain swap solution (Fusion+) between Ethereum (EVM) and Aptos (non-EVM) that preserves atomic hashlock/timelock security, allows bidirectional and partially-filled swaps, is relayer/resolver driven, and includes a UI for on-chain swap execution.

## 1. Architecture & Workflow Overview

- **Intent-Based Off-chain Order Engine**: User creates “swap intents” via off-chain signatures (EIP-712 for Ethereum, analogous Move-structured signatures for Aptos).
- **Resolvers/Relayers**: Compete to fill orders, pay all on-chain gas, and coordinate asset movement between chains.
- **On-chain Bridging & Escrow**: Hashlock/timelock-based escrow smart contracts deployed on both Ethereum (Solidity) and Aptos (Move).
- **Bidirectional Support**: Both ETH→APT and APT→ETH swaps.
- **Partial Fills**: Swaps can be filled by multiple resolvers in segments.
- **UI**: Simple web frontend to manage and track swaps.

## 2. Tech Stack Selection

| Component                 | Ethereum Side                         | Aptos Side                 | Shared/Off-chain         |
|---------------------------|---------------------------------------|----------------------------|--------------------------|
| Smart Contracts           | Solidity (Hardhat/Foundry, Ethers.js) | Move (Aptos CLI/SDK)       | —                        |
| Hashlock/Timelock Logic   | Solidity HTLC                         | Move HTLC module           | —                        |
| Cross-Chain Bridge        | LayerZero, Wormhole, Celer cBridge    | LayerZero, Wormhole, Celer | Off-chain relayer scripts |
| Off-chain Orderbook/Relay | Node.js/TypeScript (REST, WS)         | Node.js/TypeScript         | Node.js, PostgreSQL      |
| UI                        | React with Ethers.js & Aptos SDK      | React, Aptos SDK           | WebSocket for real-time  |
| Relayer/Resolver Process  | Node.js/TypeScript or Rust            | Node.js/TypeScript or Rust | —                        |
| Wallets                   | MetaMask, WalletConnect               | Petra, Martian             | —                        |

## 3. Implementation Steps (Precise)

### Step 1: Off-chain Intent Order Engine

- Implement back-end to accept, verify, and store signed swap “intent” orders.
    - Use EIP-712 for ETH-side order signing.
    - For Aptos, use Move-compatible off-chain signatures.
    - Standardize partial fillable orders using a Merkle tree of secrets, as in Fusion+.

### Step 2: Smart Contract Development

#### Ethereum
- Deploy Solidity contracts implementing:
    - Escrow contract with hashlock and timelock.
    - Function to allow resolver to deposit/move tokens on behalf of user.
    - Support for partial fills (split orders via Merkle tree of secrets—see Fusion+ white paper Section 2.5).

#### Aptos
- Deploy Move modules for:
    - Escrow, utilizing hashlock (secret-hash storage) and timelock (expiration logic per order).
    - Function allowing external resolvers to unlock/mint/return tokens to target wallet based on revealed secret.
    - Partial fill support via indexed secrets.

### Step 3: Cross-Chain Coordination & Relayer Logic

- Implement relayer service that:
    - Monitors orderbook for new swaps/intents.
    - When matching order is found, executes lock on source chain.
    - Validates lock and submits corresponding escrow/mint on destination chain.
    - Waits for both escrows, then releases secret for unlock and on-chain transfer.
    - Handles cancellations and refunds via timelock expiry.
    - Enables bidirectional swaps (ETH→APT & APT→ETH).

- Interface to LayerZero/Wormhole/Celer Bridge for proof of events (if used). Relayer submits signed evidence.

### Step 4: UI Implementation

- React web interface:
    - Connects to both MetaMask (Ethereum) and a compatible Aptos wallet.
    - Lets user create and sign swap intents, view bids/offers, partial fill status, and order history.
    - Shows step-by-step execution during the live demo (intent, lock, fill, secret reveal, unlock).
    - Real-time UI updates via WebSocket to backend orderbook.

### Step 5: Resolver Implementation

- Separate Node.js or Rust client that acts as resolver; monitors for orders, submits on-chain transactions on both chains (paying gas), and claims profit margin/spread.

### Step 6: Demo and Verification

- Prepare bidirectional demos:
    - ETH→APT: User swaps ETH, receives APT.
    - APT→ETH: User swaps APT, receives ETH.
- On-chain transactions are confirmed live, and UI reflects all state changes.
- Show partial fill (two resolvers fill different portions).

## 4. Security and Compliance

- **Hashlock**: All asset transfers on both chains can only be unlocked when the correct secret is revealed on-chain.
- **Timelock**: Refund/cancellation logic ensures no funds lost in case of incomplete swaps.
- **Whitelisted resolvers**: (Recommended for production, optional for hackathon)—resolvers must be whitelisted or KYC’d.
- **Merkle tree of secrets**: To prevent partial fill/exploit, as detailed in 1inch Fusion+ spec.

## 5. Integration Plan

1. Develop backend and smart contracts, deploying to Ethereum testnet (Sepolia) and Aptos testnet.
2. Integrate bridge/messaging solution for proof-of-escrow (LayerZero, Celer, or mock in hackathon).
3. Build and connect the UI.
4. Simulate partial fills and multi-resolver bidding.
5. Run end-to-end tests with timing to confirm atomicity and refund.
6. Finalize demo with both ETH→APT and APT→ETH live swaps.

## 6. Deliverables

- Off-chain intent/order relay back-end and documented API.
- Solidity/Ethereum escrow contract, deployed/tested on testnet.
- Move/Aptos escrow module, deployed/tested on testnet.
- Relayer and resolver client scripts.
- React-based UI supporting swap flows.
- Live demo walkthrough showing intent creation, bid, fill, unlock (with partial fill split), on-chain confirmations, and UI.
- Documentation with instructions for setup, signing, and resolving swaps.

This architecture fully satisfies:
- Fusion+ cross-chain atomic swaps between Ethereum and Aptos,
- Preservation of hashlock/timelock security on both chains (even non-EVM),
- Bidirectional and partially filled swaps,
- Resolver/relayer-driven on-chain execution,
- Seamless user experience ensured by the integrated UI[1].

[1] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/1363211/0e7297b4-5ac0-4add-b6a2-151deac856f5/1inch-fusion-plus.pdf