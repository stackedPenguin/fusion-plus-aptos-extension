const hre = require("hardhat");

async function main() {
  console.log("Deploying updated FusionPlusEscrowV2 with optional safety deposit...");

  const FusionPlusEscrowV2 = await hre.ethers.getContractFactory("FusionPlusEscrowV2");
  const escrow = await FusionPlusEscrowV2.deploy();

  await escrow.deployed();
  const address = escrow.address;

  console.log("FusionPlusEscrowV2 deployed to:", address);
  console.log("\n✨ Features:");
  console.log("  - Safety deposit is now optional (0 ETH allowed)");
  console.log("  - Supports true gasless experience");
  console.log("  - Gracefully handles withdraw/refund with 0 safety deposit");
  
  console.log("\n📝 Next steps:");
  console.log(`  1. Update ETHEREUM_ESCROW_ADDRESS in .env to: ${address}`);
  console.log("  2. Restart the resolver service");
  
  // Verify on Etherscan (if not on localhost)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations...");
    await escrow.deployTransaction.wait(6);
    
    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [],
      });
      console.log("✅ Contract verified on Etherscan!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });