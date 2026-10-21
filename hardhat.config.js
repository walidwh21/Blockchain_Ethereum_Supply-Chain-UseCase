require("@nomicfoundation/hardhat-toolbox");

const { SEPOLIA_RPC_URL, DEPLOYER_KEY } = process.env;

module.exports = {
  solidity: "0.8.24",
  networks: SEPOLIA_RPC_URL && DEPLOYER_KEY
    ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [DEPLOYER_KEY] } }
    : {}
};
