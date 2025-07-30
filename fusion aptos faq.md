how does current fusion+ implementation on EVM chains do gasless transfers?

Current Fusion+ implementations (notably 1inch Fusion+) on EVM chains achieve **gasless transfers** primarily through *intent-based architecture* and a system of **resolvers** or relayers who take on the gas costs, allowing users to interact without holding or paying native tokens.

**How Fusion+ Enables Gasless Transfers:**

- **Off-Chain Order Signing:** Users sign an order (an “intent” to swap tokens) off-chain using their wallet, specifying input/output tokens and amounts. This does *not* require Ether or any gas at this stage[4][8].
- **Resolvers Fill Orders:** Specialized actors called *resolvers* or market makers monitor these off-chain intents. When they identify an order to fill, they submit it to the blockchain and cover the gas fees for execution[4][8].
- **Dutch Auction & Bidding:** The system often employs a Dutch auction format where resolvers compete to fill orders at the best possible price over time; this competition further incentivizes resolvers to handle gas costs efficiently[4][8].
- **No Upfront User Gas Cost:** Since resolvers submit and pay for the actual on-chain transaction, users do not need to fund their wallet with ETH (or the native gas token) to perform a swap[4][8].

**Architecture Details:**

- Fusion+’s model is built on the “intent-based” swap paradigm, separating user signing from on-chain execution. Users broadcast signed swap intents (off-chain signatures), and resolvers act as counter-parties, responsible for both executing the trade and covering gas[8].
- If a transaction fails, users incur zero costs, as there was no on-chain submission from their wallet[4].

**Relation to Account Abstraction & EIP-7702:**
- Recent enhancements in the EVM (such as EIP-7702 and account abstraction) make it easier to implement gasless flows for both EOAs (Externally Owned Accounts) and smart accounts by enabling mechanisms where relayers or paymasters sponsor transactions, with or without protocol changes[6][12].
- Some advanced Fusion+ variants may leverage these abstractions for more flexible workflows, but the core principle remains: execution and gas are handled by third-party actors rather than the end user[12].

**Summary Table:**

| Component            | Fusion+ Mechanism for Gasless Transfer             |
|----------------------|---------------------------------------------------|
| User Action          | Signs intent off-chain (no gas needed)            |
| Execution Actor      | Resolver/relayer (market maker or DEX backend)    |
| Gas Payment          | Paid by the resolver, not the user                |
| On-Chain Submission  | Initiated by resolver, not directly by user       |
| When Fees Apply      | User only pays fees (if any) to the resolver via trade price, not as separate gas              |
| User Experience      | No need for ETH/gas tokens; seamless swap process |

**Design Notes & Limitations:**
- The “gasless” property applies only to supported intents/orders via the Fusion+ system; standard ERC-20 transfers outside this architecture are not gasless.
- Users may still pay a slightly higher spread or receive a slightly different rate to compensate resolvers for their service.
- Full gasless support relies on active, well-incentivized resolvers and relayers.

----
what technology is used for specifically the gasless transfer for the swap? for example if wallet A has ETH and wallet B has cbBTC - what tech is used to withdraw ETH without gas?

Gasless swaps on EVM chains (like with Fusion+ or 1inch Fusion) are powered by a combination of intent-based off-chain order signing, professional "resolvers" (relayers/market makers), and atomic swap smart contract technology.

Here’s how the technology specifically enables a gasless withdrawal—let’s say Wallet A has ETH and Wallet B has cbBTC, and you want to withdraw or swap ETH without having ETH for gas:

### Key Technologies Behind Gasless Swaps

- **Off-Chain Intent Signing (EIP-712 Standard):**
  - The user (Wallet A) signs a swap intent off-chain, using standards like EIP-712 for structured data signing. This off-chain signature authorizes the swap but isn’t a blockchain transaction, so no ETH is needed at this stage.
- **Resolvers/Relayers Pay Gas:**
  - The signed intent is broadcast to specialized actors called resolvers. These resolvers scan for such intents and submit the actual transaction to the blockchain, paying the gas themselves.
  - This means the user never needs ETH to initiate or complete the swap. Instead, any required costs are often wrapped into the swap’s price or included as a spread[1][2].

- **Atomic Swap Smart Contracts and Escrow:**
  - For cross-chain or token-to-token swaps (like ETH ↔ cbBTC), Fusion+ smart contracts use atomic or escrow-based logic.
  - The resolver temporarily locks (escrows) the user’s ETH and simultaneously locks cbBTC from their inventory. Both tokens are only released if all conditions are met—otherwise, the transaction is reversed at no cost to the user.
  - The process is orchestrated by contracts that ensure “all-or-nothing” execution, with time locks and cryptographic secrets for secure settlement[1][2][3].

- **Gas Fee Compensation via Swap Price:**
  - Users typically pay for the service by accepting a slightly less favorable swap price; resolvers bake their costs (including gas, risk, and spread) into the exchange rate, not as a separate fee.
  - No native ETH is needed for the user’s wallet—resolvers take on the gas exposure and are compensated in their operational backend[1][2][4].

#### Example: Withdrawing ETH Without ETH for Gas
- Wallet A (with ETH) wants to send/swap ETH but has zero gas (ETH).
- Signs an off-chain order indicating the swap and target (cbBTC or another asset/address).
- Resolver detects the intent, submits the withdrawal/spending transaction on-chain, and covers all gas needed.
- User receives output tokens (cbBTC or destination asset) and pays no upfront ETH gas.

### Underlying Standards and Smart Contract Architecture

- **EIP-712:** Used for off-chain signing so users never need to spend ETH or touch the blockchain directly[5].
- **Meta-Transactions / Relays:** Core to letting third parties pay for and submit on-chain actions on behalf of users[6][7].
- **Atomic Swap/Hash Time Lock Contracts:** Secure cross-chain settlement and escrow management[1][2][3].

### Summary Table

| Step                         | Component/Tech Used                | Gasless Mechanism         |
|------------------------------|------------------------------------|---------------------------|
| Sign swap+destination intent | EIP-712, off-chain signature       | No on-chain action, no gas|
| Submit to blockchain         | Resolver/relayer, meta-transactions| Resolver pays all gas     |
| Swap execution               | Atomic swap contracts, escrow      | Only executes if fully funded and conditions met|
| Fees to user                 | Spread in swap rate                | No explicit gas, no native ETH needed|

This means, for your example, withdrawing or swapping ETH from wallet A (with no ETH for gas) is accomplished through:
- Off-chain signing,
- Professional resolvers paying all gas,
- Settlement via smart contracts,
- No gas held by user because costs are internally offset and managed by the resolver in the swap logic[1][2][4].

----

if i were to implement a fusion+ extension to aptos - what steps / tech stack would i use? i want to focus on the transfer of assets and which technology is used to move them? (use a ETH to APT (aptos coin) swap as example)

To implement a Fusion+-style extension on Aptos with a focus on asset transfers—such as swapping ETH (Ethereum) to APT (Aptos coin)—you’d need to combine several core technologies, spanning off-chain intent architecture, cross-chain bridge infrastructure, and Aptos-native smart contracts. Here’s a step-by-step overview and recommended tech stack for this scenario:

## 1. **Intent-Based Off-Chain Order Layer**

- **User Experience:** The swap starts with a user on Ethereum (ETH holder) or Aptos (APT holder) signing an off-chain “intent” to swap. This follows the EIP-712 pattern for structured data signing, which is chain-agnostic and can be adapted for Move (Aptos’ smart contract language).
- **Technology:** Intent/interchange format (EIP-712 for ETH, custom intent objects for Move/Aptos), relayer network, signatures.

## 2. **Resolvers & Matchmaking Backend**

- **Resolvers** monitor for swap intents and compete to fill these orders. They take the role of *relayers* in sending assets across chains and executing on-chain transactions where needed.
- **Technology:** Node.js, Rust, or similar for backend orchestration; databases for orderbooks; API/WebSocket for order collection and state syncing.

## 3. **Cross-Chain Bridge (ETH↔APT)**

- **Asset Movement:** The heart of the ETH-to-APT swap is the cross-chain bridge. Resolvers (or the bridge protocol) custody incoming ETH on Ethereum, mint “wrapped” APT on Aptos (or unlock native APT from reserves), and handle atomicity/finality.
- **Production Examples:** Celer cBridge, Stargate (built on LayerZero), Wormhole, and similar interoperable protocols have proven cross-chain swap flows between EVM networks and Aptos.
- **Technology:** 
  - On Ethereum: Solidity bridge contract.
  - On Aptos: Move bridge contract to mint, burn, or release locked APT assets[1][2].
  - Off-chain agents to provide proof of finalized transactions across chains.

## 4. **Aptos Smart Contract Layer**

- **Custom Move modules** implement the swap settlement on Aptos. The Move language governs APT mint/burn, account-based transfer, escrow logic, and settlement verification. Recent improvements with the Aptos FA (Fungible Asset) standard streamline this further.
- **Technology:** Aptos Move contracts, standard client libraries (e.g., Aptos SDK for Rust, TypeScript), testnet validation tools[3][4].

## 5. **Settlement, Notification, and Finalization**

- Once the bridge attests ETH is locked on Ethereum, the Aptos smart contract mints or releases the equivalent APT to the end user.
- Resolvers pay the gas on both sides, embedding costs/fees into the swap rate—mirroring gasless experience for the user, as in Fusion+ on EVM.

### **ETH to APT Swap Example Workflow**

| Step                      | Asset Location | Technology Used         | Who Acts?       |
|---------------------------|---------------|------------------------|-----------------|
| User signs intent         | Off-chain     | EIP-712 / Move intent  | User + Wallet   |
| ETH locked in bridge      | Ethereum      | Solidity Bridge        | Resolver/Bridge |
| Intent relayed            | Off-chain     | Event/Webhook/Backend  | Resolver        |
| APT minted or released    | Aptos         | Move Bridge Contract   | Aptos contract  |
| APT delivered             | Aptos         | Move/FA Standard       | User            |

## **Tech Stack Summary**

- **Smart Contract Languages:** Solidity (ETH), Move (APT)
- **Cross-Chain Bridge:** Celer cBridge, Stargate/LayerZero for secure transfers and consensus[1][2]
- **Intent/Relayer Backend:** Node.js/Python/Rust, EIP-712 or custom Move-based signatures, RESTful or GraphQL APIs
- **Aptos Libraries/Dev Tools:** Aptos SDK, CLI tools, Move Prover/Testnet[3][5]
- **Wallets:** MetaMask (ETH), Petra/Martian (APTOS)

## **Key References for Development**

- **Aptos Bridge Examples:** Celer cBridge and Stargate both support Ethereum ↔ Aptos asset swaps and outline the steps and infrastructure for asset movement[1][2].
- **Aptos Move and FA Standard:** Official Move docs and Aptos Foundation articles explain building custom token logic and safe transfer patterns[3][4].
- **Atomic Off-Chain Coordination and Relayer Networks:** You’d adapt Fusion+’s intent/relayer structure, orchestrating off-chain match and on-chain fulfillment for the user-facing “gasless” experience.

**In summary:**  
A Fusion+ extension for Aptos requires a robust intent-collection backend, resolver/relayer network, secure cross-chain bridge (ETH to APT), and custom Move modules on Aptos to mint or release assets. For the ETH to APT example, most current production-grade cross-chain bridges like Celer cBridge or Stargate already demonstrate the required bridging, settlement, and off-chain coordination tech stack[1][2][3][4].

----

how many total wallets are here and who pays what


In the specific cross-chain Fusion+-style ETH to APT (Aptos coin) swap scenario using the architecture previously described, here’s the breakdown regarding the **number of wallets involved** and **who pays which costs**:

## Wallets Involved

1. **User Wallet on Ethereum (Wallet A):**
   - Holds ETH (the asset to be swapped or transferred).
2. **User Wallet on Aptos (Wallet B):**
   - Receives APT (Aptos coin) after the swap is completed on the Aptos chain.
3. **Resolver’s Wallets (optional, but typical):**
   - **Ethereum-side Resolver/Relayer Wallet:** Pays gas to move ETH into the bridge on behalf of the user.
   - **Aptos-side Resolver Wallet:** Responsible for interacting with the Aptos contract to mint/release APT, paying the Aptos gas fees if necessary.

**Minimum distinct wallets:** 2 (User’s ETH wallet and User’s APT wallet)
**Typical total involved:** 3 to 4 (including the resolver/relayer on each chain)

## Who Pays What?

- **User (on Ethereum):**
  - **Pays:** No direct blockchain gas (if implemented "gasless" as in Fusion+), the user signs an off-chain intent/order.
  - **Compensation:** The user receives slightly less favorable swap pricing, as the resolver’s gas and service fees are baked into the swap rate or deducted from the output amount—not paid as explicit network gas.

- **Resolver/Relayer:**
  - **Pays:** All on-chain gas fees required for:
    - Bridging ETH from Ethereum (gas to call bridge contracts)
    - Minting/releasing APT on Aptos (gas for Move contracts)
  - **Compensation:** Covered by taking a small spread included in the swap rate, or other financial incentive (fee, arbitrage margin).

- **User (on Aptos):**
  - **Receives:** APT released or minted into their wallet. No gas needed from the user's side; interaction is entirely off-chain from user perspective.

| Role                | Wallet               | Pays Gas? | Pays Fees?            | Receives          |
|---------------------|----------------------|-----------|-----------------------|-------------------|
| User (Ethereum)     | User’s ETH wallet    | No        | In swap rate (spread) | APT (on Aptos)    |
| User (Aptos)        | User’s Aptos wallet  | No        | No direct gas/fees    | APT (final asset) |
| Resolver/Relayer    | Own wallets (both)   | Yes       | N/A (gets spread)     | Swap margin/spread|

### In summary:

- **At least 2 user wallets** (ETH source, APT destination).
- **Typically 1-2 resolver wallets** (to pay gas on both chains).
- **User never pays blockchain gas directly.**
- **Resolvers pay all network gas, recouped through swap/pricing margin.**
- **End user experience is seamless (“gasless”), but the gas costs are covered by the party providing cross-chain liquidity and operational orchestration.**

----
does this confirm with our white paper?


Currently, the 1inch Fusion+ API and its associated developer tools only provide direct support and contract endpoints for EVM-compatible blockchains (Ethereum, BNB Chain, Polygon, etc.)—there is no out-of-the-box 1inch API endpoint or SDK function that natively supports Aptos (a non-EVM chain) as a swap source or destination[1][2][3][4][5]. However, there are clear pathways and recommended practices for integrating cross-chain support, especially in the context of hackathons and new chain extensions.

### 1inch API Options for Hackathons/Non-EVM Chains

- **Fusion+ API (Intent-Based)**
  - The 1inch Fusion+ API, which covers intent-based, gasless swaps, provides all required endpoints for quoting, order creation, and resolver participation for EVM chains[4].
  - For non-EVM chains like Aptos, you cannot use these endpoints directly for on-chain actions, but you can:
    - Use the **Fusion+ API's off-chain quoting and order protocols** as a reference for structuring intents and swap data.
    - Build custom move modules/smart contracts on Aptos that mimic Fusion+ escrow and HTLC logic.
    - Handle all bridging/off-chain coordination in your backend, using the API as the “EVM-side intent and monitoring” engine, while your code controls the Aptos-side execution.

- **Cross Chain SDK**
  - The official `@1inch/cross-chain-sdk` (npm library) is oriented toward creating and monitoring atomic swap orders across EVM networks[6].
  - You can adapt the API/interface layer of this SDK for your intent-matching backend, but the contract calls and signed messages require separate implementation for Aptos.

- **1inch Developer Portal APIs**
  - The developer portal offers REST endpoints for price discovery, swap quotes, and partial order book management[1][2][3].
  - These APIs provide a great interface for quoting and managing the EVM side of a cross-chain intent, but actual cross-chain on-chain execution and assets transfer on Aptos must be handled with custom logic in Move.

### **How to Structure Your Hackathon Implementation**

1. **Use Fusion+ API for Intent Discovery**  
   - Build or use the open 1inch API endpoints for EVM-side quoting, order creation, and order monitoring[4].
   - Collect user swap “intents” and generate order objects mimicking the Fusion+ format.

2. **Extend Resolver Logic to Aptos**
   - Your backend acts as the resolver, watching for valid swap intents and calling your own Aptos smart contract.
   - Construct a Move-based escrow/atomic swap module that mirrors the escrow lifecycle and secret hash unlocking described in 1inch Fusion+.

3. **Custom Cross-Chain Bridging**
   - Use existing cross-chain bridges with Aptos support (e.g., LayerZero, Celer cBridge) to move assets from EVM → Aptos.
   - Settle the destination asset on Aptos by calling your Move contract once the EVM escrow is resolved.

4. **API Integration for UX**
   - Expose a combined API that:
     - Quotes based on both EVM and Aptos chain liquidity,
     - Uses 1inch APIs where available (for EVM side),
     - Handles Aptos logic internally or via your Aptos module.

### **Key Takeaway**

For the hackathon, you **can use the 1inch Fusion+ API for EVM intents**, leveraging its order and quote endpoints for user-facing flows and as a guide for intent structure. **However, all on-chain Aptos logic (escrow, locks, mint/release) must be implemented with custom Move contracts**—you'll have to bridge 1inch's off-chain intent/RPC protocol with your own resolver and settlement layer on Aptos[7][8][9].

This hybrid approach—using 1inch APIs for the EVM leg and custom backend/Aptos logic for non-EVM execution—is specifically encouraged in the latest 1inch hackathon guidelines for extending Fusion+ to chains like Aptos and is fully compliant with the outlined developer workflow[7][8][9].
----

create a final product requirement document that's clear and easy to imeplement with concret steps but satisfy :

Implement 1inch Cross-chain Swap (Fusion+) to enable swaps between Ethereum and Aptos
Preserve hashlock and timelock functionality for the non-EVM implementation
Swap functionality should be bidirectional (swaps should be possible to and from Ethereum)
Onchain execution of token transfers should be presented during the final demo
with
UI
Enable partial fills
Relayer and resolver

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



When a cross-chain Fusion+ swap from ETH (Ethereum) to APT (Aptos coin) is completed, the transfer to Wallet B (the recipient on Aptos) follows an on-chain, non-custodial, and trustless pathway where the user doesn't initiate or approve the final APT transfer on Aptos. Here is the detailed breakdown of how this happens, and the distinct roles played by the relayer and resolver:

## **Swap Completion Workflow: ETH → APT**

### 1. **Escrow Creation on Ethereum**
- The **user** (maker) generates and signs a Fusion+ order, which contains a secret hash and states their intent to swap ETH for APT, designating Wallet B on Aptos as the target recipient.
- The **resolver** (taker) picks up the order via the relayer service. The resolver deposits the user's ETH into a smart contract escrow on Ethereum. This escrow is "locked" using the secret hash and timelock parameters set in the order.

### 2. **Escrow Creation on Aptos**
- The resolver then creates a matching escrow or minting operation on Aptos (using a Move smart contract), depositing/locking the equivalent APT tokens. This escrow uses the same secret hash and timelock.

### 3. **Verification and Secret Reveal (Role of the Relayer)**
- The **relayer** is an off-chain coordination service run by 1inch or protocol operators. It watches both blockchains and ensures both escrows are properly set up and confirmed.
- Only **after both escrows are verified as valid and finality locks have passed**:
  - The relayer signals to the user interface (or backend) to reveal the preimage (the secret) that matches the secret hash.
  - The user’s frontend or backend transmits the secret to the relayer, which then distributes it securely to the resolver and to the blockchain contracts.

### 4. **Unlocking and Funds Transfer to Wallet B**
- With the secret revealed, the **resolver** now unlocks:
  - The ETH on Ethereum (claiming funds for themselves).
  - The APT on Aptos. Here’s the critical part: **the resolver uses the revealed secret to call the unlock/mint/release function on the Move escrow contract**, specifying *Wallet B* as the target. The contract logic allows this transfer, because Wallet B’s address was set as the recipient during escrow creation.
- **No further action or explicit approval is required from Wallet B or the user at this stage**. The protocol is designed so that the resolver, using the legitimate secret, is authorized to execute the final transfer directly to Wallet B[1][2][3].

### 5. **Funds Delivered, Atomic Security Ensured**
- The APT coins are delivered by the contract to Wallet B.
- If anything fails (e.g., secret not revealed or resolver fails to act before timelock), funds are automatically refundable via cancellation, preserving trustlessness and atomicity.

## **Roles Explained**

| Role     | Responsibilities                                                                                        |
|----------|--------------------------------------------------------------------------------------------------------|
| Relayer  | Watches both chains, validates that both escrows are properly set, and coordinates secret distribution. |
| Resolver | Creates escrows, pays on-chain gas, submits secret to unlock funds, and initiates the transfer to Wallet B.       |
| Wallet B | Designated recipient on Aptos. Receives APT passively—no approval or action needed during resolution.             |

- **Relayer** ensures the correct sequencing and atomicity of the swap but never has custody of funds—acts solely as a coordinator.
- **Resolver** does all on-chain execution and covers all gas fees. Takes custody of released ETH and ensures APT is delivered to destination wallet.
- **Wallet B** is the passive destination, set during the original order. It simply receives APT as a result of the contract call; no on-chain approval or interaction required when release is initiated by the resolver via secret[1][2][3].

**Summary**:  
APT is transferred to Wallet B on Aptos by the resolver, who submits the secret (once escrows are set and secret is revealed) to the Move smart contract, which then transfers/mints tokens to Wallet B automatically. The user does not need to approve this step; the process is atomic, coordinated by the relayer, and executed fully on-chain by the resolver as defined in the Fusion+ protocol. This upholds a gasless, secure, and non-custodial experience for the user.
