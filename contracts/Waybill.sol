// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Waybill
/// @notice Minimal on-chain catalog and order tracker. Merchants list items,
///         buyers place orders, and every status change is recorded as an event.
///         No funds move through this contract (settlement happens off-chain).
/// @dev Never put personal data in `ref`. Use an order reference or an
///      encrypted/off-chain pointer; everything on a public chain is readable.
contract Waybill {
    enum Status { Placed, Shipped, Delivered, Cancelled }

    struct Item {
        uint256 id;
        address merchant;
        string name;
        uint256 price;
        uint256 stock;
        bool active;
    }

    struct Order {
        uint256 id;
        uint256 itemId;
        address buyer;
        uint256 quantity;
        uint256 unitPrice; // snapshot of the price at order time
        string ref;        // off-chain reference for fulfilment details
        Status status;
        uint64 createdAt;
        uint64 updatedAt;
    }

    uint256 public itemCount;
    uint256 public orderCount;

    mapping(address => string) public merchantName;
    mapping(uint256 => Item) private _items;
    mapping(uint256 => Order) private _orders;
    mapping(address => uint256[]) private _merchantItems;
    mapping(address => uint256[]) private _merchantOrders;
    mapping(address => uint256[]) private _buyerOrders;

    event MerchantRegistered(address indexed merchant, string name);
    event ItemAdded(uint256 indexed id, address indexed merchant, string name, uint256 price, uint256 stock);
    event ItemUpdated(uint256 indexed id, uint256 price, uint256 stock, bool active);
    event OrderPlaced(uint256 indexed id, uint256 indexed itemId, address indexed buyer, uint256 quantity);
    event OrderStatusChanged(uint256 indexed id, Status status);

    error NotMerchant();
    error AlreadyRegistered();
    error EmptyText();
    error UnknownItem();
    error UnknownOrder();
    error ItemUnavailable();
    error InvalidQuantity();
    error NotAllowed();
    error InvalidTransition();

    modifier onlyMerchant() {
        if (bytes(merchantName[msg.sender]).length == 0) revert NotMerchant();
        _;
    }

    // ── Merchants ──

    function registerMerchant(string calldata name) external {
        if (bytes(merchantName[msg.sender]).length != 0) revert AlreadyRegistered();
        if (bytes(name).length == 0) revert EmptyText();
        merchantName[msg.sender] = name;
        emit MerchantRegistered(msg.sender, name);
    }

    function isMerchant(address who) external view returns (bool) {
        return bytes(merchantName[who]).length != 0;
    }

    function addItem(string calldata name, uint256 price, uint256 stock) external onlyMerchant returns (uint256 id) {
        if (bytes(name).length == 0) revert EmptyText();
        id = ++itemCount;
        _items[id] = Item(id, msg.sender, name, price, stock, true);
        _merchantItems[msg.sender].push(id);
        emit ItemAdded(id, msg.sender, name, price, stock);
    }

    function updateItem(uint256 id, uint256 price, uint256 stock, bool active) external {
        Item storage it = _items[id];
        if (it.id == 0) revert UnknownItem();
        if (it.merchant != msg.sender) revert NotAllowed();
        it.price = price;
        it.stock = stock;
        it.active = active;
        emit ItemUpdated(id, price, stock, active);
    }

    // ── Buyers ──

    function placeOrder(uint256 itemId, uint256 quantity, string calldata ref) external returns (uint256 id) {
        Item storage it = _items[itemId];
        if (it.id == 0) revert UnknownItem();
        if (!it.active) revert ItemUnavailable();
        if (quantity == 0 || quantity > it.stock) revert InvalidQuantity();

        it.stock -= quantity;
        id = ++orderCount;
        _orders[id] = Order(id, itemId, msg.sender, quantity, it.price, ref, Status.Placed,
            uint64(block.timestamp), uint64(block.timestamp));
        _buyerOrders[msg.sender].push(id);
        _merchantOrders[it.merchant].push(id);
        emit OrderPlaced(id, itemId, msg.sender, quantity);
    }

    // ── Fulfilment ──

    /// @notice Merchant: Placed→Shipped→Delivered, or Placed/Shipped→Cancelled.
    ///         Buyer: Placed→Cancelled. Cancelling restores stock exactly once.
    function setStatus(uint256 orderId, Status next) external {
        Order storage o = _orders[orderId];
        if (o.id == 0) revert UnknownOrder();
        Item storage it = _items[o.itemId];
        bool byMerchant = it.merchant == msg.sender;
        bool byBuyer = o.buyer == msg.sender;
        if (!byMerchant && !byBuyer) revert NotAllowed();

        Status cur = o.status;
        bool ok;
        if (next == Status.Shipped) ok = byMerchant && cur == Status.Placed;
        else if (next == Status.Delivered) ok = byMerchant && cur == Status.Shipped;
        else if (next == Status.Cancelled)
            ok = (byMerchant && (cur == Status.Placed || cur == Status.Shipped))
              || (byBuyer && cur == Status.Placed);
        if (!ok) revert InvalidTransition();

        if (next == Status.Cancelled) it.stock += o.quantity;
        o.status = next;
        o.updatedAt = uint64(block.timestamp);
        emit OrderStatusChanged(orderId, next);
    }

    // ── Reads ──

    function getItem(uint256 id) external view returns (Item memory) {
        if (_items[id].id == 0) revert UnknownItem();
        return _items[id];
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        if (_orders[id].id == 0) revert UnknownOrder();
        return _orders[id];
    }

    /// @notice Paged catalog read; item ids start at 1.
    function itemsPage(uint256 offset, uint256 limit) external view returns (Item[] memory page) {
        if (offset >= itemCount) return new Item[](0);
        uint256 n = itemCount - offset;
        if (n > limit) n = limit;
        page = new Item[](n);
        for (uint256 i; i < n; i++) page[i] = _items[offset + i + 1];
    }

    function itemIdsOf(address merchant) external view returns (uint256[] memory) { return _merchantItems[merchant]; }
    function orderIdsOfMerchant(address merchant) external view returns (uint256[] memory) { return _merchantOrders[merchant]; }
    function orderIdsOfBuyer(address buyer) external view returns (uint256[] memory) { return _buyerOrders[buyer]; }
}
