const hre = require("hardhat");

async function main() {
  const waybill = await hre.ethers.deployContract("Waybill");
  await waybill.waitForDeployment();
  console.log("Waybill deployed to:", await waybill.getAddress());
  console.log("Paste this address into web/config.js");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
