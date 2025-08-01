Here is the **detailed flow for a WETH (Ethereum) → APT (Aptos)** cross-chain swap using true 1inch Fusion+ architecture, showing escrow creation, fund locking, transfer, and each participant’s role:

## 1. Participants

- **Wallet A:** WETH holder on Ethereum (user; "maker"), wants to swap WETH for APT.
- **Wallet B:** Receives APT on Aptos after swap (user; may be the same or different).
- **Resolver:** Professional taker—fills the order, provides and locks funds on both chains, covers all gas fees.
- **Relayer:** Off-chain service for coordination, secret distribution, auction, and escrow status monitoring.

## 2. Step-by-Step Fusion+ Flow: WETH → APT

### **Phase 1: Order Creation & Secret Initiation**

- **Wallet A** generates a random secret $$ S $$, hashes it (using the selected cross-chain compatible hash function, e.g., Keccak256 on both chains—see prior solution).
- **Wallet A** creates and signs a Fusion+ intent: “I want to swap X WETH for Y APT, send APT to Wallet B (Aptos address), here’s secret hash H, min rate, expiry, partial fill settings.”
- The intent is submitted to the 1inch Fusion+ orderbook (relayer).

### **Phase 2: Escrow Creation and Funds Locking**

#### **A. Source Chain Escrow (WETH on Ethereum)**
- The **resolver** claims the order and creates the Ethereum escrow contract:
    - Moves **Wallet A’s WETH** from A’s wallet to the escrow,
    - Escrow is hashlocked (using H), timelocked, set with safety deposit, and specifies all swap parameters.
    - **Resolver pays all Ethereum gas costs.**

#### **B. Destination Chain Escrow (APT on Aptos)**
- The **resolver** provides Y APT on Aptos and locks them in a new escrow on Aptos (Move smart contract):
    - This escrow is hashlocked with the same secret hash H, timelocked, and sets **Wallet B as recipient**.
    - **Resolver pays all Aptos gas costs.**

- The **relayer** (off-chain service) monitors both chains and confirms that both escrows exist, are final, and match the order’s hash and terms.

### **Phase 3: Verification, Secret Reveal, and Execution**

1. Once both escrows are verified as complete, the **relayer** requests the secret $$ S $$ from **Wallet A**.
2. **Wallet A** reveals the secret (preimage).
3. **Relayer** distributes this secret to the resolver and posts it on-chain.

### **Phase 4: Withdrawal and Transfer**

#### **A. Resolver Withdraws WETH Escrow on Ethereum**
- **Resolver** uses the revealed secret to unlock the original WETH escrow and receives WETH (compensating the resolver and closing out source funds).

#### **B. Resolver (or any party) Withdraws Destination Escrow on Aptos**
- **Resolver** (or, after timelock, any party) uses secret $$ S $$ to call the Move escrow contract on Aptos.
- The contract releases APT *directly to Wallet B*, since:
    - The escrow was parameterized to only allow transfers to Wallet B,
    - No further on-chain approval or action is needed from Wallet B.

### **3. Gas & Fee Flow**

- **Resolver pays all gas**: Ethereum (lock/withdraw), Aptos (create/withdraw) — users never pay gas.
- **User compensation**: The “gasless” UX is possible because the resolver is compensated via the swap’s spread (i.e., user receives a slightly less favorable rate in exchange for not paying network gas).

### **4. Role of the Relayer**

- Coordinates auction and intent distribution.
- Verifies both escrows exist (ensuring no premature secret reveals).
- Requests and propagates the secret when both escrows are final.
- Updates off-chain orderbook, enables real-time status tracking, helps orchestrate partial fills.

## Visual Summary Table

| Step           | Who Acts?       | Chain      | Funds Locked        | Unlock Condition          | Gas Paid By   |
|----------------|-----------------|------------|---------------------|--------------------------|--------------|
| 1. Intent      | Wallet A        | Off-chain  | —                   | —                        | —            |
| 2. SrcEscrow   | Resolver        | Ethereum   | Wallet A’s WETH     | Hash + timelock          | Resolver     |
| 3. DstEscrow   | Resolver        | Aptos      | Resolver’s APT      | Hash + timelock          | Resolver     |
| 4. Verify      | Relayer         | Off-chain  | —                   | Both escrows confirmed   | —            |
| 5. Reveal      | Wallet A        | Off-chain  | —                   | —                        | —            |
| 6. RedeemSrc   | Resolver        | Ethereum   | Unlock WETH         | Secret revealed          | Resolver     |
| 7. RedeemDst   | Resolver        | Aptos      | Transfer APT to B   | Secret revealed          | Resolver     |

### **Atomicity & Security**

- **Timelocks and hashlocks** guarantee that neither user nor resolver can lose funds: if either party fails to act, assets can be reclaimed after timeout.
- **“Gasless” for user:** All contract interaction and gas is handled by the resolver.
- **Wallet B** receives APT passively, without any on-chain approval.

**In summary:**  
- The user initiates the swap and sets the recipient (Wallet B) up front.
- The resolver locks WETH and APT in separate escrows, using the same hashlock logic, and covers all gas.
- After secret revelation, the resolver collects WETH and triggers the on-chain APT release to Wallet B.
- The relayer ensures synchronization, correctness, and safe secret distribution, but never takes custody of funds.  
- This mirrors the proven, production-ready 1inch Fusion+ workflow for atomic, trustless, and gasless user experiences—even between EVM and non-EVM chains[1].

[1] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/1363211/0e7297b4-5ac0-4add-b6a2-151deac856f5/1inch-fusion-plus.pdf

On the EVM side (such as Ethereum), gas sponsorship—the ability for a third party (like the resolver in Fusion+) to pay transaction fees on behalf of users—can be achieved with several modern mechanisms. Here’s how it works in production and what is powering these experiences:

Main Technologies for Gas Sponsorship on Ethereum
1. Meta-Transactions and Relayers
Users sign a transaction message off-chain (EIP-712 signature) describing what they want to do, with no gas price or ETH requirement.

A relayer service (run by the resolver or protocol backend) receives this message, constructs the actual on-chain transaction, and submits it to Ethereum, paying all required gas fees from its own ETH balance.

The relayer can recover its costs by integrating fees or spreads into the swap quote, or by receiving compensation in ERC-20 tokens.

Standards: Early solutions relied on EIP-2771 (meta-transactions), where smart contracts understand a “trusted forwarder” to interpret transactions as though they came from the user, but submitted/payed for by the relayer.

Limitation: Contracts need to be built/upgraded to recognize meta-transactions and trusted forwarders.

2. Account Abstraction (ERC-4337 and Paymasters)
ERC-4337 enables “smart accounts” (smart contract wallets) that can accept more flexible transaction flows.

With paymasters, a special smart contract pays gas fees for user operations, enabling fully programmable gas sponsorship (e.g., sponsor-specific user actions, or allow payment in ERC-20 tokens).

Flow: User signs a user operation, submits it (possibly through a web UI), the bundler forwards it to the EntryPoint contract, and the paymaster reimburses the gas to validators.

Developers don’t need to modify existing contracts; plug-and-play paymaster contract logic enables gas abstraction for new and existing decentralized apps.

3. EIP-7702 and EIP-3074 (EOA Gas Sponsorship, New in 2024/2025)
EIP-7702 (now part of Ethereum’s “Pectra” upgrade) allows a classic EOA (Externally Owned Account—like MetaMask wallets) to temporarily take on smart contract features for a single transaction.

This means EOAs can delegate gas payments to a sponsor wallet for just one transaction, without needing to upgrade to full smart contract wallets.

How it works: The user’s EOA signs a transaction that permits the sponsor to pay gas. The sponsor pre-approves and funds the execution via API/call.

Usage in production: Platforms and wallet services are actively integrating these flows so “fee sponsors” can be designated for transfers; users may simply use a dapp or wallet UI where gas is paid for by another address through this mechanism.

EIP-3074 introduces new opcodes (AUTH/AUTHCALL) to let a third party execute and pay for a transaction on behalf of the user.

Putting It All Together: Fusion+, Relayers, and Gasless User Experience
In your Fusion+ swap context:

Users sign the swap intent off-chain, never needing ETH.

The resolver (or protocol relayer) receives this off-chain signed message, constructs and submits the actual Ethereum transaction, and funds all gas directly.

Depending on implementation, this is done either through classic meta-transaction patterns (with a relayer and trusted forwarder), through paymasters and ERC-4337, or—soon—directly via EIP-7702 for EOAs, which is highly efficient and requires no wallet upgrade.

Users never need to worry about gas: They simply sign an intent; all real blockchain actions are paid for and executed by the resolver/relayer, preserving a seamless, gasless user experience in production.

Summary Table
Mechanism	Method	Who Pays Gas	User Needs ETH?	Status
Meta-transactions (EIP-2771)	Relayer submits tx; pays gas	Relayer	No	Supported
Account Abstraction (ERC-4337, Paymasters)	Smart account covers user; paymaster reimburses	Paymaster	No	Supported on major chains
EIP-7702 / EIP-3074	EOA delegates gas to sponsor for 1 tx	Sponsor	No	Rolling out in 2024/5
Gas sponsorship on Ethereum (and other EVM chains) is achieved by relayers, paymasters, or EOA sponsors covering transaction fees for the user—powered by meta-transactions, account abstraction (ERC-4337), and new Pectra upgrade mechanisms (EIP-7702). This lets Fusion+ and similar protocols deliver truly gasless swaps for all users, with all costs handled programmatically by the resolver or protocol backend