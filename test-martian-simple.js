// Quick test - copy this to browser console after connecting Martian

// Test 1: Simple coin transfer (should work)
async function testSimpleTransfer() {
    const account = (await window.martian.account()).address;
    const payload = {
        function: "0x1::coin::transfer",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [
            "0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532",
            "1000000" // 0.01 APT
        ]
    };
    console.log('Testing simple transfer:', payload);
    try {
        const tx = await window.martian.generateSignAndSubmitTransaction(account, payload);
        console.log('✅ Transfer works! Tx:', tx);
        return true;
    } catch (e) {
        console.error('❌ Transfer failed:', e.message);
        return false;
    }
}

// Test 2: Escrow with different argument formats
async function testEscrowFormats() {
    const account = (await window.martian.account()).address;
    
    // Generate test data
    const escrowId = new Uint8Array(32);
    crypto.getRandomValues(escrowId);
    
    // Try different formats
    const formats = [
        {
            name: "Arrays of numbers",
            escrowId: Array.from(escrowId),
            hashlock: Array.from(new Uint8Array(32).fill(1))
        },
        {
            name: "Hex with 0x",
            escrowId: '0x' + Array.from(escrowId).map(b => b.toString(16).padStart(2, '0')).join(''),
            hashlock: '0x' + '01'.repeat(32)
        },
        {
            name: "Hex without 0x",
            escrowId: Array.from(escrowId).map(b => b.toString(16).padStart(2, '0')).join(''),
            hashlock: '01'.repeat(32)
        }
    ];
    
    for (const format of formats) {
        console.log(`\nTesting ${format.name}:`);
        const payload = {
            function: "0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow::create_escrow",
            type_arguments: [],
            arguments: [
                format.escrowId,
                "0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532",
                "50000000",
                format.hashlock,
                Math.floor(Date.now() / 1000 + 3600).toString(),
                "100000"
            ]
        };
        
        console.log('Payload:', payload);
        try {
            const tx = await window.martian.generateSignAndSubmitTransaction(account, payload);
            console.log(`✅ ${format.name} works! Tx:`, tx);
            return format.name;
        } catch (e) {
            console.error(`❌ ${format.name} failed:`, e.message);
        }
    }
    
    return null;
}

// Run tests
(async () => {
    console.log('=== Martian Wallet Tests ===');
    
    // Ensure connected
    try {
        await window.martian.connect();
    } catch (e) {
        console.log('Already connected or connection failed');
    }
    
    // Test 1
    console.log('\n1. Testing simple transfer...');
    const transferWorks = await testSimpleTransfer();
    
    if (transferWorks) {
        // Test 2
        console.log('\n2. Testing escrow formats...');
        const workingFormat = await testEscrowFormats();
        
        if (workingFormat) {
            console.log(`\n✅ SUCCESS! Use "${workingFormat}" format for vector<u8> arguments`);
        } else {
            console.log('\n❌ All escrow formats failed');
        }
    }
})();