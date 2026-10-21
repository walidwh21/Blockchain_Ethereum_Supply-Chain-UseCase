// Fill in after deploying (see README). The chain ID is checked before any write.
window.WAYBILL = {
  address: "0x0000000000000000000000000000000000000000",
  chainId: 11155111, // Sepolia
  abi: [
    "function itemCount() view returns (uint256)",
    "function orderCount() view returns (uint256)",
    "function merchantName(address) view returns (string)",
    "function isMerchant(address) view returns (bool)",
    "function registerMerchant(string name)",
    "function addItem(string name, uint256 price, uint256 stock) returns (uint256)",
    "function updateItem(uint256 id, uint256 price, uint256 stock, bool active)",
    "function placeOrder(uint256 itemId, uint256 quantity, string ref) returns (uint256)",
    "function setStatus(uint256 orderId, uint8 next)",
    "function getItem(uint256) view returns (tuple(uint256 id, address merchant, string name, uint256 price, uint256 stock, bool active))",
    "function getOrder(uint256) view returns (tuple(uint256 id, uint256 itemId, address buyer, uint256 quantity, uint256 unitPrice, string ref, uint8 status, uint64 createdAt, uint64 updatedAt))",
    "function itemsPage(uint256 offset, uint256 limit) view returns (tuple(uint256 id, address merchant, string name, uint256 price, uint256 stock, bool active)[])",
    "function itemIdsOf(address) view returns (uint256[])",
    "function orderIdsOfMerchant(address) view returns (uint256[])",
    "function orderIdsOfBuyer(address) view returns (uint256[])"
  ]
};
