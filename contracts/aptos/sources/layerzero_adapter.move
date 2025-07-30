module escrow_addr::layerzero_adapter {
    use std::signer;
    use aptos_std::event;
    use aptos_framework::account;
    use aptos_std::table::{Self, Table};
    
    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_MESSAGE: u64 = 2;
    const E_SECRET_ALREADY_REVEALED: u64 = 3;
    
    // Struct to store revealed secrets
    struct RevealedSecret has store, drop, copy {
        escrow_id: vector<u8>,
        secret: vector<u8>,
        revealer: address,
        src_chain_id: u32,
    }
    
    // Resource to store all revealed secrets
    struct SecretStorage has key {
        secrets: Table<vector<u8>, RevealedSecret>, // escrow_id => RevealedSecret
        authorized_endpoint: address,
    }
    
    // Events
    struct SecretRevealReceived has drop, store {
        escrow_id: vector<u8>,
        secret: vector<u8>,
        revealer: address,
        src_chain_id: u32,
    }
    
    struct EventStore has key {
        secret_reveal_events: event::EventHandle<SecretRevealReceived>,
    }
    
    // Initialize the module
    public entry fun initialize(account: &signer, endpoint: address) {
        let addr = signer::address_of(account);
        assert!(addr == @escrow_addr, E_NOT_AUTHORIZED);
        
        if (!exists<SecretStorage>(addr)) {
            move_to(account, SecretStorage {
                secrets: table::new(),
                authorized_endpoint: endpoint,
            });
        };
        
        if (!exists<EventStore>(addr)) {
            move_to(account, EventStore {
                secret_reveal_events: account::new_event_handle<SecretRevealReceived>(account),
            });
        };
    }
    
    // Receive a secret reveal from LayerZero
    public entry fun receive_secret_reveal(
        account: &signer,
        src_chain_id: u32,
        escrow_id: vector<u8>,
        secret: vector<u8>,
        revealer_bytes: vector<u8>, // 20 bytes Ethereum address
    ) acquires SecretStorage, EventStore {
        let addr = signer::address_of(account);
        
        // Only the authorized endpoint can call this
        let storage = borrow_global_mut<SecretStorage>(@escrow_addr);
        assert!(addr == storage.authorized_endpoint, E_NOT_AUTHORIZED);
        
        // Check if secret already revealed
        assert!(!table::contains(&storage.secrets, escrow_id), E_SECRET_ALREADY_REVEALED);
        
        // Convert Ethereum address bytes to Aptos address (simplified)
        let revealer = @0x1; // In production, properly convert the address
        
        // Store the revealed secret
        let reveal = RevealedSecret {
            escrow_id: escrow_id,
            secret: secret,
            revealer: revealer,
            src_chain_id: src_chain_id,
        };
        
        table::add(&mut storage.secrets, escrow_id, reveal);
        
        // Emit event
        let event_store = borrow_global_mut<EventStore>(@escrow_addr);
        event::emit_event(&mut event_store.secret_reveal_events, SecretRevealReceived {
            escrow_id: escrow_id,
            secret: secret,
            revealer: revealer,
            src_chain_id: src_chain_id,
        });
    }
    
    // Check if a secret has been revealed
    public fun has_secret_revealed(escrow_id: &vector<u8>): bool acquires SecretStorage {
        let storage = borrow_global<SecretStorage>(@escrow_addr);
        table::contains(&storage.secrets, *escrow_id)
    }
    
    // Get a revealed secret
    public fun get_revealed_secret(escrow_id: &vector<u8>): (vector<u8>, address) acquires SecretStorage {
        let storage = borrow_global<SecretStorage>(@escrow_addr);
        assert!(table::contains(&storage.secrets, *escrow_id), E_INVALID_MESSAGE);
        
        let reveal = table::borrow(&storage.secrets, *escrow_id);
        (reveal.secret, reveal.revealer)
    }
    
    // Send a secret reveal to another chain (to be implemented with LayerZero SDK)
    public entry fun send_secret_reveal(
        account: &signer,
        dst_chain_id: u32,
        escrow_id: vector<u8>,
        secret: vector<u8>,
    ) {
        let sender = signer::address_of(account);
        
        // In production, this would:
        // 1. Encode the message
        // 2. Call LayerZero endpoint to send the message
        // 3. Pay the required fee
        
        // For now, just emit an event
        // TODO: Integrate with LayerZero Aptos SDK when available
    }
}