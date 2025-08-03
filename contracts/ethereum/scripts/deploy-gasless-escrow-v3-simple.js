const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying FusionPlusGaslessEscrowV2 with simple partial fill support...");

  // Get the contract factory
  const FusionPlusGaslessEscrowV2 = await ethers.getContractFactory("FusionPlusGaslessEscrowV2");

  // Deploy the contract
  const gaslessEscrow = await FusionPlusGaslessEscrowV2.deploy();
  await gaslessEscrow.deployed();

  const contractAddress = gaslessEscrow.address;
  console.log(`✅ FusionPlusGaslessEscrowV2 deployed to: ${contractAddress}`);

  // Verify the deployment by checking the domain separator
  const domainSeparator = await gaslessEscrow.DOMAIN_SEPARATOR();
  console.log(`🔒 Domain separator: ${domainSeparator}`);

  // Check that our new function exists
  try {
    const nonce = await gaslessEscrow.getNonce("0x0000000000000000000000000000000000000000");
    console.log(`✅ getNonce function works, test nonce: ${nonce}`);
  } catch (error) {
    console.log(`❌ getNonce function failed: ${error.message}`);
  }

  console.log(`\n📋 Contract Details:`);
  console.log(`   Address: ${contractAddress}`);
  console.log(`   Network: Sepolia`);
  console.log(`   Features: Regular gasless escrows + Simple gasless partial fills`);
  console.log(`   New Function: createGaslessPartialFillEscrow`);

  console.log(`\n🔧 Update your .env files with:`);
  console.log(`   ETHEREUM_GASLESS_ESCROW_ADDRESS=${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });