const hre = require("hardhat");

async function main() {
  console.log("Deploying FusionPlusEscrow to", hre.network.name);

  const FusionPlusEscrow = await hre.ethers.getContractFactory("FusionPlusEscrow");
  const escrow = await FusionPlusEscrow.deploy();

  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("FusionPlusEscrow deployed to:", address);
  
  // Verify on Etherscan (if not local network)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmations...");
    await escrow.deploymentTransaction().wait(5);
    
    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [],
      });
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