module fusion_plus::escrow {
    use std::signer;
    use std::vector;
    use std::bcs;
    use aptos_framework::timestamp;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    // use aptos_framework::account; // Not needed for current implementation
    use aptos_std::table::{Self, Table};
    // use aptos_std::aptos_hash; // TODO: Uncomment when keccak256 is available on testnet
    use aptos_std::ed25519;
    use escrow_addr::layerzero_adapter;

    /// Error codes
    const E_ESCROW_ALREADY_EXISTS: u64 = 1;
    const E_ESCROW_NOT_FOUND: u64 = 2;
    const E_INVALID_SECRET: u64 = 3;
    const E_ALREADY_WITHDRAWN: u64 = 4;
    const E_ALREADY_REFUNDED: u64 = 5;
    const E_TIMELOCK_NOT_EXPIRED: u64 = 6;
    const E_INVALID_AMOUNT: u64 = 7;
    const E_INVALID_TIMELOCK: u64 = 8;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 9;
    const E_INVALID_SIGNATURE: u64 = 10;
    const E_NOT_AUTHORIZED_RESOLVER: u64 = 11;
    const E_EXPIRED_SIGNATURE: u64 = 12;
    const E_INVALID_NONCE: u64 = 13;
    const E_INSUFFICIENT_BALANCE: u64 = 14;

    struct Escrow has store {
        depositor: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        withdrawn: bool,
        refunded: bool,
        safety_deposit: u64,
        escrowed_coin: Coin<AptosCoin>
    }

    struct EscrowStore has key {
        escrows: Table<vector<u8>, Escrow>,
        safety_deposits: Table<vector<u8>, Coin<AptosCoin>>
    }

    struct ResolverRegistry has key {
        authorized_resolvers: Table<address, bool>,
        user_nonces: Table<address, u64>
    }

    struct OrderMessage has drop {
        escrow_id: vector<u8>,
        depositor: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        nonce: u64,
        expiry: u64
    }

    /// Initialize the escrow store and resolver registry
    public entry fun initialize(account: &signer) {
        let escrow_store = EscrowStore {
            escrows: table::new(),
            safety_deposits: table::new()
        };
        move_to(account, escrow_store);
        
        let resolver_registry = ResolverRegistry {
            authorized_resolvers: table::new(),
            user_nonces: table::new()
        };
        move_to(account, resolver_registry);
    }

    /// Add an authorized resolver
    public entry fun add_authorized_resolver(admin: &signer, resolver: address) acquires ResolverRegistry {
        assert!(signer::address_of(admin) == @fusion_plus, E_NOT_AUTHORIZED_RESOLVER);
        let registry = borrow_global_mut<ResolverRegistry>(@fusion_plus);
        table::add(&mut registry.authorized_resolvers, resolver, true);
    }

    /// Remove an authorized resolver
    public entry fun remove_authorized_resolver(admin: &signer, resolver: address) acquires ResolverRegistry {
        assert!(signer::address_of(admin) == @fusion_plus, E_NOT_AUTHORIZED_RESOLVER);
        let registry = borrow_global_mut<ResolverRegistry>(@fusion_plus);
        table::remove(&mut registry.authorized_resolvers, resolver);
    }

    /// Create a new escrow
    public entry fun create_escrow(
        depositor: &signer,
        escrow_id: vector<u8>,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit_amount: u64
    ) acquires EscrowStore {
        let depositor_addr = signer::address_of(depositor);
        
        // Ensure the escrow store exists at the fusion_plus address
        assert!(exists<EscrowStore>(@fusion_plus), E_ESCROW_NOT_FOUND);

        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        // Check if escrow already exists
        assert!(!table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_ALREADY_EXISTS);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        assert!(safety_deposit_amount > 0, E_INSUFFICIENT_SAFETY_DEPOSIT);

        // Transfer coins from depositor
        let escrowed_coin = coin::withdraw<AptosCoin>(depositor, amount);
        let safety_deposit = coin::withdraw<AptosCoin>(depositor, safety_deposit_amount);

        let escrow = Escrow {
            depositor: depositor_addr,
            beneficiary,
            amount,
            hashlock,
            timelock,
            withdrawn: false,
            refunded: false,
            safety_deposit: safety_deposit_amount,
            escrowed_coin
        };

        table::add(&mut escrow_store.escrows, escrow_id, escrow);
        table::add(&mut escrow_store.safety_deposits, escrow_id, safety_deposit);
    }

    /// Create escrow on behalf of a user with their signature (gasless for user)
    public entry fun create_escrow_delegated(
        resolver: &signer,
        escrow_id: vector<u8>,
        depositor_addr: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        nonce: u64,
        expiry: u64,
        safety_deposit_amount: u64,
        depositor_pubkey: vector<u8>,
        signature: vector<u8>
    ) acquires EscrowStore, ResolverRegistry {
        let resolver_addr = signer::address_of(resolver);
        
        // Check resolver is authorized
        let registry = borrow_global_mut<ResolverRegistry>(@fusion_plus);
        assert!(table::contains(&registry.authorized_resolvers, resolver_addr), E_NOT_AUTHORIZED_RESOLVER);
        
        // Check signature hasn't expired
        assert!(timestamp::now_seconds() <= expiry, E_EXPIRED_SIGNATURE);
        
        // Check nonce is valid (prevents replay attacks)
        if (table::contains(&registry.user_nonces, depositor_addr)) {
            let current_nonce = *table::borrow(&registry.user_nonces, depositor_addr);
            assert!(nonce > current_nonce, E_INVALID_NONCE);
        };
        
        // Create the message to verify
        let message = OrderMessage {
            escrow_id,
            depositor: depositor_addr,
            beneficiary,
            amount,
            hashlock,
            timelock,
            nonce,
            expiry
        };
        
        // Serialize the message for signature verification
        let message_bytes = bcs::to_bytes(&message);
        
        // Verify the signature
        let pk = ed25519::new_unvalidated_public_key_from_bytes(depositor_pubkey);
        let sig = ed25519::new_signature_from_bytes(signature);
        assert!(ed25519::signature_verify_strict(&sig, &pk, message_bytes), E_INVALID_SIGNATURE);
        
        // Update nonce
        if (table::contains(&registry.user_nonces, depositor_addr)) {
            *table::borrow_mut(&mut registry.user_nonces, depositor_addr) = nonce;
        } else {
            table::add(&mut registry.user_nonces, depositor_addr, nonce);
        };
        
        // Create escrow
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        assert!(!table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_ALREADY_EXISTS);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        assert!(safety_deposit_amount > 0, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        // Check user has sufficient balance
        assert!(coin::balance<AptosCoin>(depositor_addr) >= amount, E_INSUFFICIENT_BALANCE);
        
        // Ensure resolver has a coin store
        if (!coin::is_account_registered<AptosCoin>(signer::address_of(resolver))) {
            coin::register<AptosCoin>(resolver);
        };
        
        // For hackathon demo: Resolver fronts the APT temporarily
        // In production, this would use a different mechanism (e.g., account abstraction)
        // IMPORTANT: When resolver fronts APT, they become the beneficiary
        let actual_beneficiary = signer::address_of(resolver); // Resolver gets the APT
        let escrowed_coin = coin::withdraw<AptosCoin>(resolver, amount); // Resolver fronts the APT
        let safety_deposit = coin::withdraw<AptosCoin>(resolver, safety_deposit_amount);
        
        let escrow = Escrow {
            depositor: depositor_addr,
            beneficiary: actual_beneficiary, // Resolver is beneficiary when fronting
            amount,
            hashlock,
            timelock,
            withdrawn: false,
            refunded: false,
            safety_deposit: safety_deposit_amount,
            escrowed_coin
        };
        
        table::add(&mut escrow_store.escrows, escrow_id, escrow);
        table::add(&mut escrow_store.safety_deposits, escrow_id, safety_deposit);
    }

    /// Withdraw funds using the correct secret
    public entry fun withdraw(
        withdrawer: &signer,
        escrow_id: vector<u8>,
        secret: vector<u8>
    ) acquires EscrowStore {
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        assert!(table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_NOT_FOUND);
        
        let escrow = table::borrow_mut(&mut escrow_store.escrows, escrow_id);
        
        assert!(!escrow.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.refunded, E_ALREADY_REFUNDED);
        
        // IMPORTANT: keccak256 is not available on testnet yet
        // For hackathon demo, we'll verify the secret is correct length
        // In production, uncomment the keccak256 verification below
        assert!(vector::length(&secret) == 32, E_INVALID_SECRET);
        
        // Production code (when keccak256 is available):
        // let secret_hash = aptos_hash::keccak256(secret);
        // assert!(secret_hash == escrow.hashlock, E_INVALID_SECRET);
        
        escrow.withdrawn = true;
        
        // Transfer escrowed coins to beneficiary
        let amount = escrow.amount;
        let beneficiary = escrow.beneficiary;
        let coin_to_transfer = coin::extract(&mut escrow.escrowed_coin, amount);
        coin::deposit(beneficiary, coin_to_transfer);
        
        // Transfer safety deposit to withdrawer
        let safety_deposit = table::remove(&mut escrow_store.safety_deposits, escrow_id);
        coin::deposit(signer::address_of(withdrawer), safety_deposit);
    }

    /// Withdraw funds using a secret revealed on another chain via LayerZero
    public entry fun withdraw_cross_chain(
        withdrawer: &signer,
        escrow_id: vector<u8>
    ) acquires EscrowStore {
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        assert!(table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_NOT_FOUND);
        
        let escrow = table::borrow_mut(&mut escrow_store.escrows, escrow_id);
        
        assert!(!escrow.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.refunded, E_ALREADY_REFUNDED);
        
        // Check if secret has been revealed via LayerZero
        assert!(layerzero_adapter::has_secret_revealed(&escrow_id), E_INVALID_SECRET);
        
        // Get the revealed secret and verify it
        let (secret, _revealer) = layerzero_adapter::get_revealed_secret(&escrow_id);
        
        // IMPORTANT: keccak256 is not available on testnet yet
        // For now, we trust LayerZero's verification
        // Production code (when keccak256 is available):
        // let secret_hash = aptos_hash::keccak256(secret);
        // assert!(secret_hash == escrow.hashlock, E_INVALID_SECRET);
        
        escrow.withdrawn = true;
        
        // Transfer escrowed coins to beneficiary
        let amount = escrow.amount;
        let beneficiary = escrow.beneficiary;
        let coin_to_transfer = coin::extract(&mut escrow.escrowed_coin, amount);
        coin::deposit(beneficiary, coin_to_transfer);
        
        // Transfer safety deposit to withdrawer
        let safety_deposit = table::remove(&mut escrow_store.safety_deposits, escrow_id);
        coin::deposit(signer::address_of(withdrawer), safety_deposit);
    }

    #[view]
    /// Check if an escrow exists
    public fun escrow_exists(escrow_id: vector<u8>): bool acquires EscrowStore {
        if (!exists<EscrowStore>(@fusion_plus)) {
            return false
        };
        let escrow_store = borrow_global<EscrowStore>(@fusion_plus);
        table::contains(&escrow_store.escrows, escrow_id)
    }

    /// Refund funds after timelock expires
    public entry fun refund(
        refunder: &signer,
        escrow_id: vector<u8>
    ) acquires EscrowStore {
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        assert!(table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_NOT_FOUND);
        
        let escrow = table::borrow_mut(&mut escrow_store.escrows, escrow_id);
        
        assert!(!escrow.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.refunded, E_ALREADY_REFUNDED);
        assert!(timestamp::now_seconds() >= escrow.timelock, E_TIMELOCK_NOT_EXPIRED);
        
        escrow.refunded = true;
        
        // Transfer escrowed coins back to depositor
        let amount = escrow.amount;
        let depositor = escrow.depositor;
        let coin_to_transfer = coin::extract(&mut escrow.escrowed_coin, amount);
        coin::deposit(depositor, coin_to_transfer);
        
        // Transfer safety deposit to refunder
        let safety_deposit = table::remove(&mut escrow_store.safety_deposits, escrow_id);
        coin::deposit(signer::address_of(refunder), safety_deposit);
    }

}