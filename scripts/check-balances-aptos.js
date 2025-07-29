const fetch = require('node-fetch');

async function checkBalanceUsingView(address) {
    try {
        const viewUrl = 'https://fullnode.testnet.aptoslabs.com/v1/view';
        
        // Use the coin::balance view function
        const payload = {
            function: "0x1::coin::balance",
            type_arguments: ["0x1::aptos_coin::AptosCoin"],
            arguments: [address]
        };
        
        console.log(`Checking balance for ${address} using view function...`);
        
        const response = await fetch(viewUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result && result.length > 0) {
                const balance = result[0];
                const aptAmount = parseInt(balance) / 1e8;
                return {
                    address,
                    balance: balance,
                    aptAmount: aptAmount
                };
            }
        } else {
            const errorText = await response.text();
            return {
                address,
                error: `View function failed: ${response.status} - ${errorText}`
            };
        }
    } catch (error) {
        return {
            address,
            error: error.message
        };
    }
}

async function main() {
    const addresses = [
        '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35',
        '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532'
    ];
    
    console.log('🔍 Checking Aptos wallet balances using view function...\n');
    
    for (const address of addresses) {
        const result = await checkBalanceUsingView(address);
        
        console.log(`Address: ${result.address}`);
        if (result.error) {
            console.log(`  ❌ Error: ${result.error}`);
        } else {
            console.log(`  💰 APT Balance: ${result.aptAmount} APT`);
            console.log(`  📊 Raw Balance: ${result.balance} (octas)`);
        }
        console.log();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { checkBalanceUsingView };