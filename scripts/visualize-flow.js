const chalk = require('chalk');

async function visualizeFlow() {
  console.clear();
  console.log('\n🎨 Fusion+ Visual Flow Diagram\n');
  
  // Step 1: Initial State
  console.log('INITIAL STATE:');
  console.log('┌─────────────┐                    ┌─────────────┐');
  console.log('│    USER     │                    │  RESOLVER   │');
  console.log('├─────────────┤                    ├─────────────┤');
  console.log('│ ETH: 0.1    │                    │ ETH: 0      │');
  console.log('│ APT: 0      │                    │ APT: 10     │');
  console.log('└─────────────┘                    └─────────────┘');
  console.log('       │                                  │');
  console.log('       └──────────┐          ┌────────────┘');
  console.log('                  │          │');
  console.log('                  ▼          ▼');
  console.log('              ┌─────────────────┐');
  console.log('              │     RELAYER     │');
  console.log('              │  (Pays all gas) │');
  console.log('              └─────────────────┘\n');
  
  await pause();
  
  // Step 2: User signs intent
  console.log('STEP 1: User signs swap intent (off-chain)');
  console.log('┌─────────────┐');
  console.log('│    USER     │ ──── "I want to swap 0.001 ETH for 0.5 APT"');
  console.log('└─────────────┘      (Just a signature, no gas!)');
  console.log('       │');
  console.log('       │ Intent');
  console.log('       ▼');
  console.log('┌─────────────────┐');
  console.log('│  ORDER ENGINE   │');
  console.log('└─────────────────┘\n');
  
  await pause();
  
  // Step 3: Resolver creates destination escrow
  console.log('STEP 2: Resolver creates destination escrow');
  console.log('                                   ┌─────────────┐');
  console.log('                                   │  RESOLVER   │');
  console.log('                                   └─────┬───────┘');
  console.log('                                         │ Locks 0.5 APT');
  console.log('                                         ▼');
  console.log('┌────────────────────────────────────────────────┐');
  console.log('│              APTOS BLOCKCHAIN                  │');
  console.log('│  ┌──────────────────────────────────────────┐ │');
  console.log('│  │ Escrow: 0.5 APT                          │ │');
  console.log('│  │ Beneficiary: User                        │ │');
  console.log('│  │ Hashlock: hash(resolver_secret)          │ │');
  console.log('│  └──────────────────────────────────────────┘ │');
  console.log('└────────────────────────────────────────────────┘\n');
  
  await pause();
  
  // Step 4: User creates source escrow
  console.log('STEP 3: User creates source escrow (via Relayer - GASLESS!)');
  console.log('┌─────────────┐');
  console.log('│    USER     │ ──── "Create escrow with my 0.001 ETH"');
  console.log('└─────────────┘');
  console.log('       │');
  console.log('       ▼');
  console.log('┌─────────────┐');
  console.log('│   RELAYER   │ ──── Pays gas and creates escrow');
  console.log('└─────────────┘');
  console.log('       │');
  console.log('       ▼');
  console.log('┌────────────────────────────────────────────────┐');
  console.log('│            ETHEREUM BLOCKCHAIN                 │');
  console.log('│  ┌──────────────────────────────────────────┐ │');
  console.log('│  │ Escrow: 0.001 ETH                        │ │');
  console.log('│  │ Beneficiary: Resolver                    │ │');
  console.log('│  │ Hashlock: hash(resolver_secret)          │ │');
  console.log('│  └──────────────────────────────────────────┘ │');
  console.log('└────────────────────────────────────────────────┘\n');
  
  await pause();
  
  // Step 5: Secret reveal
  console.log('STEP 4: Resolver reveals secret and claims ETH');
  console.log('┌─────────────┐');
  console.log('│  RESOLVER   │ ──── "withdraw(escrowId, SECRET)"');
  console.log('└─────────────┘');
  console.log('       │');
  console.log('       ▼');
  console.log('┌────────────────────────────────────────────────┐');
  console.log('│            ETHEREUM BLOCKCHAIN                 │');
  console.log('│  ┌──────────────────────────────────────────┐ │');
  console.log('│  │ 🔓 Secret revealed on-chain!             │ │');
  console.log('│  │ Resolver receives 0.001 ETH             │ │');
  console.log('│  │ emit EscrowWithdrawn(..., SECRET)       │ │');
  console.log('│  └──────────────────────────────────────────┘ │');
  console.log('└────────────────────────────────────────────────┘\n');
  
  await pause();
  
  // Step 6: User claims
  console.log('STEP 5: User uses revealed secret to claim APT (GASLESS!)');
  console.log('┌─────────────┐');
  console.log('│    USER     │ ──── "I see the secret! Withdraw APT"');
  console.log('└─────────────┘');
  console.log('       │');
  console.log('       ▼');
  console.log('┌─────────────┐');
  console.log('│   RELAYER   │ ──── Pays gas and withdraws for user');
  console.log('└─────────────┘');
  console.log('       │');
  console.log('       ▼');
  console.log('┌────────────────────────────────────────────────┐');
  console.log('│              APTOS BLOCKCHAIN                  │');
  console.log('│  ┌──────────────────────────────────────────┐ │');
  console.log('│  │ 🔓 Secret matches! User receives 0.5 APT │ │');
  console.log('│  └──────────────────────────────────────────┘ │');
  console.log('└────────────────────────────────────────────────┘\n');
  
  await pause();
  
  // Final state
  console.log('FINAL STATE:');
  console.log('┌─────────────┐                    ┌─────────────┐');
  console.log('│    USER     │                    │  RESOLVER   │');
  console.log('├─────────────┤                    ├─────────────┤');
  console.log('│ ETH: 0.099  │ (-0.001)          │ ETH: 0.001  │ (+0.001)');
  console.log('│ APT: 0.5    │ (+0.5)            │ APT: 9.5    │ (-0.5)');
  console.log('│             │                    │             │');
  console.log('│ Gas paid: 0 │                    │ Gas paid: 0 │');
  console.log('└─────────────┘                    └─────────────┘\n');
  
  console.log('                  ┌─────────────────┐');
  console.log('                  │     RELAYER     │');
  console.log('                  │   Paid all gas   │');
  console.log('                  │  on both chains  │');
  console.log('                  └─────────────────┘\n');
  
  console.log('✅ ATOMIC SWAP COMPLETE - Everyone wins!\n');
}

function pause() {
  return new Promise(resolve => setTimeout(resolve, 1500));
}

// Check if chalk is installed
try {
  require.resolve('chalk');
  visualizeFlow().catch(console.error);
} catch(e) {
  console.log('Note: Install chalk for colored output: npm install chalk');
  visualizeFlow().catch(console.error);
}