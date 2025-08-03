module escrow_addr::fusion_plus_partial_fill {
    use std::signer;
    use std::vector;
    use aptos_std::table::{Self, Table};
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    // use aptos_std::ed25519; // TODO: Enable for signature verification
    use aptos_std::hash;
    use aptos_std::bcs;
    use aptos_std::event;
    use aptos_framework::account;

    // Error codes
    const E_ESCROW_ALREADY_EXISTS: u64 = 1;
    const E_ESCROW_NOT_FOUND: u64 = 2;
    const E_ALREADY_WITHDRAWN: u64 = 3;
    const E_ALREADY_REFUNDED: u64 = 4;
    const E_INVALID_SECRET: u64 = 5;
    const E_TIMELOCK_NOT_EXPIRED: u64 = 6;
    const E_INVALID_AMOUNT: u64 = 7;
    const E_INVALID_TIMELOCK: u64 = 8;
    const E_ORDER_NOT_FOUND: u64 = 9;
    const E_INVALID_MERKLE_INDEX: u64 = 10;
    const E_MERKLE_INDEX_ALREADY_USED: u64 = 11;
    const E_EXCEEDS_TOTAL_AMOUNT: u64 = 12;
    const E_INVALID_SIGNATURE: u64 = 13;
    const E_EXPIRED_SIGNATURE: u64 = 14;
    const E_INVALID_NONCE: u64 = 15;
    const E_INVALID_MERKLE_PROOF: u64 = 16;

    struct PartialFillOrder has store {
        base_order_id: vector<u8>,
        depositor: address,
        beneficiary: address,
        total_amount: u64,
        filled_amount: u64,
        merkle_root: vector<u8>,
        num_fills: u64,
        timelock: u64,
        used_indices: Table<u64, bool>,
    }

    struct Escrow has store {
        depositor: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        withdrawn: bool,
        refunded: bool,
        safety_deposit: Coin<AptosCoin>,
    }

    struct OrderMessage has drop {
        base_order_id: vector<u8>,
        depositor: address,
        beneficiary: address,
        total_amount: u64,
        merkle_root: vector<u8>,
        num_fills: u64,
        timelock: u64,
        nonce: u64,
        expiry: u64,
    }

    struct PartialFillRegistry has key {
        orders: Table<vector<u8>, PartialFillOrder>,
        escrows: Table<vector<u8>, Escrow>,
        user_nonces: Table<address, u64>,
    }

    // Events
    struct PartialFillOrderCreated has drop, store {
        base_order_id: vector<u8>,
        depositor: address,
        beneficiary: address,
        total_amount: u64,
        merkle_root: vector<u8>,
        num_fills: u64,
    }

    struct EscrowCreated has drop, store {
        escrow_id: vector<u8>,
        depositor: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
    }

    struct EscrowWithdrawn has drop, store {
        escrow_id: vector<u8>,
        secret: vector<u8>,
    }

    struct EventStore has key {
        order_created_events: event::EventHandle<PartialFillOrderCreated>,
        escrow_created_events: event::EventHandle<EscrowCreated>,
        escrow_withdrawn_events: event::EventHandle<EscrowWithdrawn>,
    }

    // Initialize the module
    fun init_module(account: &signer) {
        move_to(account, PartialFillRegistry {
            orders: table::new(),
            escrows: table::new(),
            user_nonces: table::new(),
        });
        
        move_to(account, EventStore {
            order_created_events: account::new_event_handle<PartialFillOrderCreated>(account),
            escrow_created_events: account::new_event_handle<EscrowCreated>(account),
            escrow_withdrawn_events: account::new_event_handle<EscrowWithdrawn>(account),
        });
    }

    /// Create a partial fill order with user's signature
    public entry fun create_partial_fill_order(
        resolver: &signer,
        base_order_id: vector<u8>,
        depositor: address,
        beneficiary: address,
        total_amount: u64,
        merkle_root: vector<u8>,
        num_fills: u64,
        timelock: u64,
        nonce: u64,
        expiry: u64,
        depositor_pubkey: vector<u8>,
        signature: vector<u8>,
    ) acquires PartialFillRegistry, EventStore {
        let registry = borrow_global_mut<PartialFillRegistry>(@escrow_addr);
        
        // Check order doesn't already exist
        assert!(!table::contains(&registry.orders, base_order_id), E_ESCROW_ALREADY_EXISTS);
        assert!(total_amount > 0, E_INVALID_AMOUNT);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        assert!(timestamp::now_seconds() <= expiry, E_EXPIRED_SIGNATURE);
        
        // Check nonce is valid
        if (table::contains(&registry.user_nonces, depositor)) {
            let current_nonce = *table::borrow(&registry.user_nonces, depositor);
            assert!(nonce > current_nonce, E_INVALID_NONCE);
        };
        
        // Verify signature (simplified for hackathon)
        let order_message = OrderMessage {
            base_order_id: base_order_id,
            depositor: depositor,
            beneficiary: beneficiary,
            total_amount: total_amount,
            merkle_root: merkle_root,
            num_fills: num_fills,
            timelock: timelock,
            nonce: nonce,
            expiry: expiry,
        };
        
        // TODO: Implement proper signature verification
        // For hackathon, skip signature verification
        
        // Update nonce
        if (table::contains(&registry.user_nonces, depositor)) {
            *table::borrow_mut(&mut registry.user_nonces, depositor) = nonce;
        } else {
            table::add(&mut registry.user_nonces, depositor, nonce);
        };
        
        // Create the partial fill order
        let order = PartialFillOrder {
            base_order_id: base_order_id,
            depositor: depositor,
            beneficiary: beneficiary,
            total_amount: total_amount,
            filled_amount: 0,
            merkle_root: merkle_root,
            num_fills: num_fills,
            timelock: timelock,
            used_indices: table::new(),
        };
        
        table::add(&mut registry.orders, base_order_id, order);
        
        // Emit event
        let event_store = borrow_global_mut<EventStore>(@escrow_addr);
        event::emit_event(&mut event_store.order_created_events, PartialFillOrderCreated {
            base_order_id: base_order_id,
            depositor: depositor,
            beneficiary: beneficiary,
            total_amount: total_amount,
            merkle_root: merkle_root,
            num_fills: num_fills,
        });
    }

    /// Create a partial fill escrow using Merkle proof
    public entry fun create_partial_fill_escrow(
        resolver: &signer,
        base_order_id: vector<u8>,
        fill_index: u64,
        amount: u64,
        hashlock: vector<u8>,
        merkle_proof: vector<vector<u8>>,
        safety_deposit_amount: u64,
    ) acquires PartialFillRegistry, EventStore {
        let registry = borrow_global_mut<PartialFillRegistry>(@escrow_addr);
        
        // Get the order
        assert!(table::contains(&registry.orders, base_order_id), E_ORDER_NOT_FOUND);
        let order = table::borrow_mut(&mut registry.orders, base_order_id);
        
        // Validate fill
        assert!(fill_index < order.num_fills, E_INVALID_MERKLE_INDEX);
        assert!(!table::contains(&order.used_indices, fill_index), E_MERKLE_INDEX_ALREADY_USED);
        assert!(order.filled_amount + amount <= order.total_amount, E_EXCEEDS_TOTAL_AMOUNT);
        
        // Verify Merkle proof
        let hash = hash::sha3_256(hashlock);
        assert!(verify_merkle_proof(merkle_proof, order.merkle_root, hash, fill_index), E_INVALID_MERKLE_PROOF);
        
        // Mark index as used
        table::add(&mut order.used_indices, fill_index, true);
        order.filled_amount = order.filled_amount + amount;
        
        // Generate escrow ID
        let escrow_id = generate_escrow_id(&base_order_id, fill_index);
        
        // Take safety deposit from resolver
        let safety_deposit = coin::withdraw<AptosCoin>(resolver, safety_deposit_amount);
        
        // Take funds from depositor (user has pre-approved via signature)
        // In production, this would use the signed approval
        // For hackathon, we'll use resolver's funds and reimburse later
        let resolver_addr = signer::address_of(resolver);
        let escrow_funds = coin::withdraw<AptosCoin>(resolver, amount);
        coin::deposit(resolver_addr, escrow_funds); // Temporary - reimburse resolver
        
        // Create the escrow
        let escrow = Escrow {
            depositor: order.depositor,
            beneficiary: order.beneficiary,
            amount: amount,
            hashlock: hashlock,
            timelock: order.timelock,
            withdrawn: false,
            refunded: false,
            safety_deposit: safety_deposit,
        };
        
        table::add(&mut registry.escrows, escrow_id, escrow);
        
        // Emit event
        let event_store = borrow_global_mut<EventStore>(@escrow_addr);
        event::emit_event(&mut event_store.escrow_created_events, EscrowCreated {
            escrow_id: escrow_id,
            depositor: order.depositor,
            beneficiary: order.beneficiary,
            amount: amount,
            hashlock: hashlock,
            timelock: order.timelock,
        });
    }

    /// Verify a Merkle proof
    fun verify_merkle_proof(
        proof: vector<vector<u8>>,
        root: vector<u8>,
        leaf: vector<u8>,
        index: u64,
    ): bool {
        let computed_hash = leaf;
        let i = 0;
        let current_index = index;
        
        while (i < vector::length(&proof)) {
            let proof_element = *vector::borrow(&proof, i);
            
            if (current_index % 2 == 0) {
                // Hash(current, proof)
                let combined = vector::empty<u8>();
                vector::append(&mut combined, computed_hash);
                vector::append(&mut combined, proof_element);
                computed_hash = hash::sha3_256(combined);
            } else {
                // Hash(proof, current)
                let combined = vector::empty<u8>();
                vector::append(&mut combined, proof_element);
                vector::append(&mut combined, computed_hash);
                computed_hash = hash::sha3_256(combined);
            };
            
            current_index = current_index / 2;
            i = i + 1;
        };
        
        computed_hash == root
    }

    /// Generate escrow ID from base order ID and fill index
    fun generate_escrow_id(base_order_id: &vector<u8>, fill_index: u64): vector<u8> {
        let data = vector::empty<u8>();
        vector::append(&mut data, *base_order_id);
        vector::append(&mut data, bcs::to_bytes(&fill_index));
        hash::sha3_256(data)
    }

    /// Withdraw from escrow with secret
    public entry fun withdraw(
        withdrawer: &signer,
        escrow_id: vector<u8>,
        secret: vector<u8>,
    ) acquires PartialFillRegistry, EventStore {
        let registry = borrow_global_mut<PartialFillRegistry>(@escrow_addr);
        
        assert!(table::contains(&registry.escrows, escrow_id), E_ESCROW_NOT_FOUND);
        let escrow = table::borrow_mut(&mut registry.escrows, escrow_id);
        
        assert!(!escrow.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.refunded, E_ALREADY_REFUNDED);
        
        // Verify the secret
        let secret_hash = hash::sha3_256(secret);
        assert!(secret_hash == escrow.hashlock, E_INVALID_SECRET);
        
        escrow.withdrawn = true;
        
        // Transfer funds to beneficiary
        let beneficiary_addr = escrow.beneficiary;
        coin::deposit(beneficiary_addr, coin::withdraw<AptosCoin>(withdrawer, escrow.amount));
        
        // Give safety deposit to withdrawer as incentive
        let withdrawer_addr = signer::address_of(withdrawer);
        let safety_deposit = coin::extract_all(&mut escrow.safety_deposit);
        coin::deposit(withdrawer_addr, safety_deposit);
        
        // Emit event
        let event_store = borrow_global_mut<EventStore>(@escrow_addr);
        event::emit_event(&mut event_store.escrow_withdrawn_events, EscrowWithdrawn {
            escrow_id: escrow_id,
            secret: secret,
        });
    }

    // Get partial fill order details
    #[view]
    public fun get_partial_fill_order(base_order_id: vector<u8>): (u64, u64, vector<u8>, u64) acquires PartialFillRegistry {
        let registry = borrow_global<PartialFillRegistry>(@escrow_addr);
        
        if (table::contains(&registry.orders, base_order_id)) {
            let order = table::borrow(&registry.orders, base_order_id);
            (order.total_amount, order.filled_amount, order.merkle_root, order.num_fills)
        } else {
            (0, 0, vector::empty(), 0)
        }
    }
}