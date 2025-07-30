const axios = require('axios');

async function checkBalanceUsingView(address) {
    try {
        const viewUrl = 'https://fullnode.testnet.aptoslabs.com/v1/view';
        
        // Use the coin::balance view function
        const payload = {
            function: "0x1::coin::balance",
            type_arguments: ["0x1::aptos_coin::AptosCoin"],
            arguments: [address]
        };
        
        const response = await axios.post(viewUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data && response.data.length > 0) {
            const balance = response.data[0];
            const aptAmount = parseInt(balance) / 1e8;
            return {
                address,
                balance: balance,
                aptAmount: aptAmount
            };
        }
    } catch (error) {
        return {
            address,
            error: error.response?.data || error.message
        };
    }
}

async function main() {
    const addresses = [
        {
            name: 'Deployer',
            address: '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0'
        },
        {
            name: 'Resolver', 
            address: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532'
        }
    ];
    
    console.log('🔍 Checking Aptos wallet balances using view function...\n');
    
    for (const account of addresses) {
        const result = await checkBalanceUsingView(account.address);
        
        console.log(`${account.name} (${account.address})`);
        if (result.error) {
            console.log(`  ❌ Error: ${result.error}`);
        } else {
            console.log(`  ✅ Balance: ${result.aptAmount} APT`);
            console.log(`  📊 Raw Balance: ${result.balance} octas`);
        }
        console.log();
    }
}

main().catch(console.error);