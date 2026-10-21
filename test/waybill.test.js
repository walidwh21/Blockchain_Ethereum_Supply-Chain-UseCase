const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Waybill", () => {
  let w, merchant, buyer, other;
  beforeEach(async () => {
    [merchant, buyer, other] = await ethers.getSigners();
    w = await ethers.deployContract("Waybill");
    await w.connect(merchant).registerMerchant("Acme");
    await w.connect(merchant).addItem("Widget", 10, 5);
  });

  it("only registered merchants can list items", async () => {
    await expect(w.connect(buyer).addItem("X", 1, 1)).to.be.revertedWithCustomError(w, "NotMerchant");
  });

  it("reserves stock when an order is placed", async () => {
    await w.connect(buyer).placeOrder(1, 2, "ref-1");
    expect((await w.getItem(1)).stock).to.equal(3n);
    expect((await w.getOrder(1)).status).to.equal(0n);
  });

  it("rejects zero or oversized quantities", async () => {
    await expect(w.connect(buyer).placeOrder(1, 0, "r")).to.be.revertedWithCustomError(w, "InvalidQuantity");
    await expect(w.connect(buyer).placeOrder(1, 6, "r")).to.be.revertedWithCustomError(w, "InvalidQuantity");
  });

  it("walks Placed -> Shipped -> Delivered", async () => {
    await w.connect(buyer).placeOrder(1, 1, "r");
    await w.connect(merchant).setStatus(1, 1);
    await w.connect(merchant).setStatus(1, 2);
    expect((await w.getOrder(1)).status).to.equal(2n);
  });

  it("restores stock only once on cancel", async () => {
    await w.connect(buyer).placeOrder(1, 2, "r");
    await w.connect(buyer).setStatus(1, 3);
    expect((await w.getItem(1)).stock).to.equal(5n);
    await expect(w.connect(merchant).setStatus(1, 3)).to.be.revertedWithCustomError(w, "InvalidTransition");
    expect((await w.getItem(1)).stock).to.equal(5n);
  });

  it("blocks strangers and illegal transitions", async () => {
    await w.connect(buyer).placeOrder(1, 1, "r");
    await expect(w.connect(other).setStatus(1, 1)).to.be.revertedWithCustomError(w, "NotAllowed");
    await expect(w.connect(buyer).setStatus(1, 2)).to.be.revertedWithCustomError(w, "InvalidTransition");
  });
});
