const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying Fixed FusionPlusGaslessEscrowV2 Contract...");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Deploy the contract
  const FusionPlusGaslessEscrowV2 = await hre.ethers.getContractFactory("FusionPlusGaslessEscrowV2");
  const gaslessEscrow = await FusionPlusGaslessEscrowV2.deploy();

  await gaslessEscrow.deployed();

  const address = gaslessEscrow.address;
  console.log("✅ FusionPlusGaslessEscrowV2 deployed to:", address);

  // Save deployment info
  const deploymentInfo = {
    contract: "FusionPlusGaslessEscrowV2",
    address: address,
    network: hre.network.name,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
    note: "Fixed nonce increment bug - nonce now incremented AFTER signature verification"
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `gasless-escrow-v2-fixed-${hre.network.name}.json`;
  const filepath = path.join(deploymentsDir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log("📄 Deployment info saved to:", filepath);

  // Verify contract on Etherscan if not on localhost
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("⏳ Waiting for block confirmations...");
    await gaslessEscrow.deployTransaction.wait(5);
    
    try {
      console.log("🔍 Verifying contract on Etherscan...");
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [],
      });
      console.log("✅ Contract verified on Etherscan");
    } catch (error) {
      console.log("❌ Verification failed:", error.message);
    }
  }

  console.log("\n🎉 Deployment Summary:");
  console.log("Contract Address:", address);
  console.log("Network:", hre.network.name);
  console.log("Fix Applied: Nonce increment now happens AFTER signature verification");
  console.log("\n📋 Next Steps:");
  console.log("1. Update frontend .env:");
  console.log(`   REACT_APP_ETHEREUM_GASLESS_ESCROW_CONTRACT=${address}`);
  console.log("2. Update resolver .env files:");
  console.log(`   ETHEREUM_GASLESS_ESCROW_ADDRESS=${address}`);
  console.log("3. Restart frontend and resolver services");
  console.log("4. Test gasless transactions");

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });