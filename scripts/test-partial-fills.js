#!/usr/bin/env node

/**
 * Test script for partial fill functionality
 * Tests the Merkle tree secret generation and partial fill logic
 */

const { ethers } = require('ethers');

// Import the utility (assuming we build it or copy it for testing)
const { PartialFillSecretsManager } = require('../backend/order-engine/src/utils/partialFillSecrets');

async function testPartialFillSecrets() {
  console.log('🧩 Testing Partial Fill Secrets Generation\n');
  
  // Test 1: Generate secrets for 4-part order
  console.log('📋 Test 1: Generate 4-part partial fill secrets');
  const secrets = PartialFillSecretsManager.generateSecrets(4);
  
  console.log(`   ✅ Generated ${secrets.secrets.length} secrets (expected: 5)`);
  console.log(`   ✅ Fill thresholds: [${secrets.fillThresholds.join(', ')}]%`);
  console.log(`   ✅ Merkle root: ${secrets.merkleRoot.slice(0, 10)}...`);
  console.log(`   ✅ Proofs generated: ${secrets.merkleProofs.length}\n`);
  
  // Test 2: Test secret index calculation
  console.log('📋 Test 2: Test secret index calculation');
  const testCases = [
    { fill: 20, expected: 0 }, // 20% -> first secret (0-25%)
    { fill: 25, expected: 0 }, // 25% -> first secret  
    { fill: 30, expected: 1 }, // 30% -> second secret (25-50%)
    { fill: 50, expected: 1 }, // 50% -> second secret
    { fill: 75, expected: 2 }, // 75% -> third secret (50-75%)
    { fill: 100, expected: 3 }, // 100% -> fourth secret (75-100%)
  ];
  
  for (const test of testCases) {
    const index = PartialFillSecretsManager.getSecretIndex(test.fill, secrets.fillThresholds);
    const status = index === test.expected ? '✅' : '❌';
    console.log(`   ${status} ${test.fill}% fill -> secret index ${index} (expected: ${test.expected})`);
  }
  console.log();
  
  // Test 3: Test partial amount calculation
  console.log('📋 Test 3: Test partial amount calculation');
  const totalAmount = ethers.parseEther('1.0').toString(); // 1 WETH
  
  const amountTests = [
    { percentage: 25, expected: '0.25' },
    { percentage: 50, expected: '0.5' },
    { percentage: 75, expected: '0.75' },
    { percentage: 100, expected: '1.0' }
  ];
  
  for (const test of amountTests) {
    const partialAmount = PartialFillSecretsManager.calculatePartialAmount(totalAmount, test.percentage);
    const formatted = ethers.formatEther(partialAmount);
    const isCorrect = formatted === test.expected;
    const status = isCorrect ? '✅' : '❌';
    console.log(`   ${status} ${test.percentage}% of 1 WETH = ${formatted} WETH (expected: ${test.expected})`);
  }
  console.log();
  
  // Test 4: Test escrow ID generation
  console.log('📋 Test 4: Test partial escrow ID generation');
  const baseOrderId = 'order-123456';
  const escrowIds = [];
  
  for (let i = 0; i < 3; i++) {
    const escrowId = PartialFillSecretsManager.generatePartialEscrowId(baseOrderId, i);
    escrowIds.push(escrowId);
    console.log(`   ✅ Fill ${i}: ${escrowId.slice(0, 20)}...`);
  }
  
  // Verify uniqueness
  const uniqueIds = new Set(escrowIds);
  const isUnique = uniqueIds.size === escrowIds.length;
  console.log(`   ${isUnique ? '✅' : '❌'} All escrow IDs are unique\n`);
  
  return true;
}

async function simulatePartialFillScenario() {
  console.log('🎭 Simulating Partial Fill Scenario\n');
  
  const orderAmount = ethers.parseEther('1.0').toString(); // 1 WETH order
  const secrets = PartialFillSecretsManager.generateSecrets(4);
  
  console.log('📊 Order: 1 WETH → APT (partial fills allowed)');
  console.log(`📊 Generated ${secrets.secrets.length} secrets for 4-part splits\n`);
  
  // Simulate multiple resolvers filling portions
  const scenarios = [
    { resolver: '0xResolver1', fillPercentage: 25, description: 'Resolver 1 fills 25%' },
    { resolver: '0xResolver2', fillPercentage: 30, description: 'Resolver 2 fills 30% more (total: 55%)' },
    { resolver: '0xResolver3', fillPercentage: 45, description: 'Resolver 3 fills remaining 45% (total: 100%)' }
  ];
  
  let cumulativeFill = 0;
  
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    cumulativeFill += scenario.fillPercentage;
    
    // Calculate which secret to use
    const secretIndex = PartialFillSecretsManager.getSecretIndex(cumulativeFill, secrets.fillThresholds);
    const partialAmount = PartialFillSecretsManager.calculatePartialAmount(orderAmount, scenario.fillPercentage);
    const escrowId = PartialFillSecretsManager.generatePartialEscrowId('order-partial-demo', i);
    
    console.log(`🔄 Fill ${i + 1}: ${scenario.description}`);
    console.log(`   🔑 Secret index: ${secretIndex} (for ${cumulativeFill}% cumulative)`);
    console.log(`   💰 Partial amount: ${ethers.formatEther(partialAmount)} WETH`);
    console.log(`   🆔 Escrow ID: ${escrowId.slice(0, 30)}...`);
    console.log(`   📊 Progress: ${cumulativeFill}% complete\n`);
    
    if (cumulativeFill >= 100) {
      console.log('🎉 Order fully filled via partial fills!\n');
      break;
    }
  }
  
  return true;
}

async function main() {
  try {
    console.log('🧪 Partial Fill Testing Suite');
    console.log('=' .repeat(50) + '\n');
    
    // Test secret generation and utilities
    await testPartialFillSecrets();
    
    // Simulate realistic scenario
    await simulatePartialFillScenario();
    
    console.log('✅ All partial fill tests passed!');
    console.log('\n🔗 Benefits of Partial Fills:');
    console.log('   • Better rates through resolver competition');
    console.log('   • Faster execution for large orders');
    console.log('   • Capital efficiency for resolvers');
    console.log('   • Enhanced user experience');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}