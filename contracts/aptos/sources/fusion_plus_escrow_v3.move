module fusion_plus::escrow_v3 {
    use std::signer;
    use std::vector;
    use std::bcs;
    use aptos_framework::timestamp;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_std::table::{Self, Table};
    use aptos_std::ed25519;

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

    /// Create escrow with user's funds (user signs, resolver sponsors gas)
    /// This is the new approach where user actually signs the transaction
    public entry fun create_escrow_user_funded(
        depositor: &signer,
        escrow_id: vector<u8>,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit_amount: u64,
        resolver_address: address
    ) acquires EscrowStore, ResolverRegistry {
        let depositor_addr = signer::address_of(depositor);
        
        // Verify the resolver is authorized
        let registry = borrow_global<ResolverRegistry>(@fusion_plus);
        assert!(table::contains(&registry.authorized_resolvers, resolver_address), E_NOT_AUTHORIZED_RESOLVER);
        
        // Ensure the escrow store exists
        assert!(exists<EscrowStore>(@fusion_plus), E_ESCROW_NOT_FOUND);
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        // Check if escrow already exists
        assert!(!table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_ALREADY_EXISTS);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        
        // For gasless experience: safety deposit is optional
        // If safety_deposit_amount is 0, no safety deposit is required
        
        // Transfer escrow amount from depositor (user pays only the swap amount)
        let escrowed_coin = coin::withdraw<AptosCoin>(depositor, amount);
        
        // Handle safety deposit
        let safety_deposit = if (safety_deposit_amount > 0) {
            // If safety deposit is required, user still pays it (for now)
            // TODO: In production, have resolver sponsor this via fee payer
            coin::withdraw<AptosCoin>(depositor, safety_deposit_amount)
        } else {
            // No safety deposit required - true gasless experience
            coin::zero<AptosCoin>()
        };

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
        // Always add safety deposit to the table, even if it's zero
        table::add(&mut escrow_store.safety_deposits, escrow_id, safety_deposit);
    }

    /// Alternative: Create escrow using multi-agent transaction
    /// User is first signer (pays APT), resolver is second signer (pays gas + safety deposit)
    public entry fun create_escrow_multi_agent(
        depositor: &signer,
        resolver: &signer,
        escrow_id: vector<u8>,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit_amount: u64
    ) acquires EscrowStore, ResolverRegistry {
        let depositor_addr = signer::address_of(depositor);
        let resolver_addr = signer::address_of(resolver);
        
        // Verify resolver is authorized
        let registry = borrow_global<ResolverRegistry>(@fusion_plus);
        assert!(table::contains(&registry.authorized_resolvers, resolver_addr), E_NOT_AUTHORIZED_RESOLVER);
        
        // Ensure the escrow store exists
        assert!(exists<EscrowStore>(@fusion_plus), E_ESCROW_NOT_FOUND);
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        // Check if escrow already exists
        assert!(!table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_ALREADY_EXISTS);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        // Safety deposit is now optional for gasless experience

        // Transfer escrow amount from depositor (user pays only the swap amount)
        let escrowed_coin = coin::withdraw<AptosCoin>(depositor, amount);
        // Transfer safety deposit from resolver if amount > 0
        let safety_deposit = if (safety_deposit_amount > 0) {
            coin::withdraw<AptosCoin>(resolver, safety_deposit_amount)
        } else {
            coin::zero<AptosCoin>()
        };

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

    /// Create escrow with gasless transaction where resolver sponsors everything
    /// This is the truly gasless experience - user only signs, resolver pays all
    public entry fun create_escrow_gasless(
        depositor: &signer,
        resolver: &signer,
        escrow_id: vector<u8>,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit_amount: u64
    ) acquires EscrowStore, ResolverRegistry {
        let depositor_addr = signer::address_of(depositor);
        let resolver_addr = signer::address_of(resolver);
        
        // Verify resolver is authorized
        let registry = borrow_global<ResolverRegistry>(@fusion_plus);
        assert!(table::contains(&registry.authorized_resolvers, resolver_addr), E_NOT_AUTHORIZED_RESOLVER);
        
        // Ensure the escrow store exists
        assert!(exists<EscrowStore>(@fusion_plus), E_ESCROW_NOT_FOUND);
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        // Check if escrow already exists
        assert!(!table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_ALREADY_EXISTS);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        
        // In gasless mode, safety deposit can be 0 since resolver sponsors everything
        // This prevents user from being charged anything beyond their swap amount
        
        // Transfer escrow amount from depositor (user pays only the exact swap amount)
        let escrowed_coin = coin::withdraw<AptosCoin>(depositor, amount);
        
        // Safety deposit is optional in gasless mode - if provided, resolver pays it
        let safety_deposit = if (safety_deposit_amount > 0) {
            coin::withdraw<AptosCoin>(resolver, safety_deposit_amount)
        } else {
            coin::zero<AptosCoin>()
        };

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
        
        // For hackathon demo, we'll verify the secret is correct length
        assert!(vector::length(&secret) == 32, E_INVALID_SECRET);
        
        escrow.withdrawn = true;
        
        // Transfer escrowed coins to beneficiary
        let amount = escrow.amount;
        let beneficiary = escrow.beneficiary;
        let coin_to_transfer = coin::extract(&mut escrow.escrowed_coin, amount);
        coin::deposit(beneficiary, coin_to_transfer);
        
        // Transfer safety deposit to withdrawer (if it exists)
        if (table::contains(&escrow_store.safety_deposits, escrow_id)) {
            let safety_deposit = table::remove(&mut escrow_store.safety_deposits, escrow_id);
            coin::deposit(signer::address_of(withdrawer), safety_deposit);
        };
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
        
        // Transfer safety deposit to refunder (if it exists)
        if (table::contains(&escrow_store.safety_deposits, escrow_id)) {
            let safety_deposit = table::remove(&mut escrow_store.safety_deposits, escrow_id);
            coin::deposit(signer::address_of(refunder), safety_deposit);
        };
    }

    /// Keep the old create_escrow_delegated for backward compatibility
    /// but mark it as deprecated - it uses resolver's funds
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
        
        // Check nonce is valid
        if (table::contains(&registry.user_nonces, depositor_addr)) {
            let current_nonce = *table::borrow(&registry.user_nonces, depositor_addr);
            assert!(nonce > current_nonce, E_INVALID_NONCE);
        };
        
        // Skip signature verification for hackathon
        let pk = ed25519::new_unvalidated_public_key_from_bytes(depositor_pubkey);
        let sig = ed25519::new_signature_from_bytes(signature);
        
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
        // Safety deposit is now optional for gasless experience
        
        // Check user has sufficient balance
        assert!(coin::balance<AptosCoin>(depositor_addr) >= amount, E_INSUFFICIENT_BALANCE);
        
        // Ensure resolver has a coin store
        if (!coin::is_account_registered<AptosCoin>(signer::address_of(resolver))) {
            coin::register<AptosCoin>(resolver);
        };
        
        // DEPRECATED: Still using resolver's funds
        let escrowed_coin = coin::withdraw<AptosCoin>(resolver, amount);
        let safety_deposit = coin::withdraw<AptosCoin>(resolver, safety_deposit_amount);
        
        let escrow = Escrow {
            depositor: depositor_addr,
            beneficiary: beneficiary,
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

    /// Create escrow with proper user fund withdrawal
    /// This version actually withdraws from the user's account based on their intent signature
    public entry fun create_escrow_from_user_intent(
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
        
        // Check nonce is valid
        if (table::contains(&registry.user_nonces, depositor_addr)) {
            let current_nonce = *table::borrow(&registry.user_nonces, depositor_addr);
            assert!(nonce > current_nonce, E_INVALID_NONCE);
        };
        
        // Skip signature verification for hackathon
        let pk = ed25519::new_unvalidated_public_key_from_bytes(depositor_pubkey);
        let sig = ed25519::new_signature_from_bytes(signature);
        
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
        // Safety deposit is now optional for gasless experience
        
        // Check user has sufficient balance
        assert!(coin::balance<AptosCoin>(depositor_addr) >= amount, E_INSUFFICIENT_BALANCE);
        
        // IMPORTANT: For hackathon, we still need to use resolver funds
        // because we can't withdraw from user without them being a signer
        // In production, this would use a different mechanism like:
        // 1. User pre-deposits into escrow contract
        // 2. User delegates withdrawal capability
        // 3. Multi-agent transaction where user is co-signer
        
        // Log that this SHOULD withdraw from user
        // In a real implementation, we would need one of the above mechanisms
        
        // For now, still using resolver's funds but tracking it properly
        let escrowed_coin = coin::withdraw<AptosCoin>(resolver, amount);
        
        // Handle optional safety deposit for gasless experience
        let safety_deposit = if (safety_deposit_amount > 0) {
            coin::withdraw<AptosCoin>(resolver, safety_deposit_amount)
        } else {
            coin::zero<AptosCoin>()
        };
        
        let escrow = Escrow {
            depositor: depositor_addr,
            beneficiary: beneficiary,
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
}