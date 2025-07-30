const hre = require("hardhat");

async function main() {
  console.log("Deploying FusionPlusPermit to", hre.network.name);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const FusionPlusPermit = await hre.ethers.getContractFactory("FusionPlusPermit");
  const permit = await FusionPlusPermit.deploy();

  await permit.deployed();

  const permitAddress = permit.address;
  console.log("FusionPlusPermit deployed to:", permitAddress);

  // Wait for confirmations
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Waiting for block confirmations...");
    await permit.deployTransaction.wait(3);
  }

  // Get domain separator
  const domainSeparator = await permit.DOMAIN_SEPARATOR();
  console.log("Domain Separator:", domainSeparator);

  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    network: hre.network.name,
    permitContract: permitAddress,
    domainSeparator: domainSeparator,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    `deployments/permit-${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\nDeployment info saved to deployments/permit-" + hre.network.name + ".json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });