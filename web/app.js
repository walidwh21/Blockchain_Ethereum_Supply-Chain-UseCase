(() => {
  const { address, abi, chainId } = window.WAYBILL;
  const STATUS = ["Placed", "Shipped", "Delivered", "Cancelled"];
  const $ = (id) => document.getElementById(id);
  let provider, signer, account, rw;
  const ro = () => new ethers.Contract(address, abi, provider);

  // Safe DOM builder: text always goes through textContent, never innerHTML.
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat()) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return el;
  }
  const fill = (el, nodes, emptyMsg) => {
    el.replaceChildren(...(nodes.length ? nodes : [h("p", { class: "empty" }, emptyMsg)]));
  };
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const date = (s) => new Date(Number(s) * 1000).toLocaleString();

  let toastTimer;
  function toast(msg, err = false) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "show" + (err ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ""), 4000);
  }
  function explain(e) {
    const name = e?.revert?.name || e?.errorName;
    const map = {
      NotMerchant: "Register as a merchant first.",
      AlreadyRegistered: "This wallet is already registered.",
      InvalidQuantity: "That quantity isn't available.",
      ItemUnavailable: "This item is no longer for sale.",
      NotAllowed: "This wallet can't do that.",
      InvalidTransition: "That status change isn't allowed from the current state.",
      EmptyText: "A required text field is empty."
    };
    if (e?.code === "ACTION_REJECTED") return "Request cancelled in your wallet.";
    return map[name] || e?.shortMessage || e?.message || "Something went wrong.";
  }

  async function run(label, fn) {
    try {
      if (!(await connect())) return;
      toast(label + "…");
      const tx = await fn();
      await tx.wait();
      toast("Done: " + label);
      await refresh();
    } catch (e) { console.error(e); toast(explain(e), true); }
  }

  async function connect() {
    if (rw) return true;
    if (!window.ethereum) { toast("Install a wallet like MetaMask to continue.", true); return false; }
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== chainId) {
      try { await provider.send("wallet_switchEthereumChain", [{ chainId: "0x" + chainId.toString(16) }]); provider = new ethers.BrowserProvider(window.ethereum); }
      catch { toast("Switch your wallet to chain " + chainId + ".", true); return false; }
    }
    signer = await provider.getSigner();
    account = await signer.getAddress();
    rw = new ethers.Contract(address, abi, signer);
    $("connect").textContent = short(account);
    window.ethereum.on?.("accountsChanged", () => location.reload());
    window.ethereum.on?.("chainChanged", () => location.reload());
    await refresh();
    return true;
  }

  // ── Renderers ──
  function itemCard(it) {
    const mine = account && it.merchant.toLowerCase() === account.toLowerCase();
    const canBuy = it.active && it.stock > 0n;
    return h("article", { class: "item" },
      h("h3", {}, it.name),
      h("div", { class: "meta" }, "Item #" + it.id + " · by " + short(it.merchant)),
      h("div", { class: "price" }, it.price.toString()),
      h("div", { class: "meta" }, it.active ? it.stock + " in stock" : "Not for sale"),
      h("div", { class: "actions" },
        h("button", { class: "btn sm", ...(canBuy ? {} : { disabled: "" }), onclick: () => openOrder(it) },
          canBuy ? "Order" : "Unavailable")));
  }

  function orderCard(o, role) {
    const s = Number(o.status);
    const cancelled = s === 3;
    const steps = ["Placed", "Shipped", "Delivered"].map((label, i) =>
      h("li", { class: cancelled ? "" : i < s ? "done" : i === s ? "done now" : "" }, label));
    const actions = [];
    if (role === "merchant") {
      if (s === 0) actions.push(btn("Mark shipped", () => setStatus(o.id, 1)));
      if (s === 1) actions.push(btn("Mark delivered", () => setStatus(o.id, 2)));
      if (s === 0 || s === 1) actions.push(btn("Cancel", () => setStatus(o.id, 3), true));
    } else if (s === 0 && account && o.buyer.toLowerCase() === account.toLowerCase()) {
      actions.push(btn("Cancel order", () => setStatus(o.id, 3), true));
    }
    return h("article", { class: "order" },
      h("header", {},
        h("span", { class: "no" }, "Order #" + o.id),
        h("span", { class: "meta" }, "Item #" + o.itemId + " × " + o.quantity + " at " + o.unitPrice)),
      cancelled ? h("p", { class: "cancelled" }, "Cancelled · stock returned to the item") : h("ol", { class: "steps" }, steps),
      h("div", { class: "meta" }, "Buyer " + short(o.buyer) + " · reference “" + o.ref + "”"),
      h("div", { class: "meta" }, "Placed " + date(o.createdAt) + " · updated " + date(o.updatedAt)),
      actions.length ? h("div", { class: "actions" }, actions) : "");
  }
  const btn = (t, f, ghost) => h("button", { class: "btn sm" + (ghost ? " ghost" : ""), onclick: f }, t);
  const setStatus = (id, next) => run("Update order #" + id, () => rw.setStatus(id, next));

  function myItemRow(it) {
    const price = h("input", { type: "number", min: "0", value: it.price.toString(), "aria-label": "Price" });
    const stock = h("input", { type: "number", min: "0", value: it.stock.toString(), "aria-label": "Stock" });
    return h("article", { class: "item" },
      h("h3", {}, it.name + " (#" + it.id + ")"),
      h("div", { class: "row" },
        h("label", { class: "field" }, h("span", {}, "Price"), price),
        h("label", { class: "field" }, h("span", {}, "Stock"), stock),
        btn("Save", () => run("Update item #" + it.id, () => rw.updateItem(it.id, price.value, stock.value, it.active))),
        btn(it.active ? "Pause sales" : "Resume sales", () => run("Update item #" + it.id, () => rw.updateItem(it.id, it.price, it.stock, !it.active)), true)));
  }

  async function refresh() {
    const c = account ? rw : ro();
    const count = Number(await c.itemCount());
    const items = count ? await c.itemsPage(0, Math.min(count, 100)) : [];
    fill($("items"), items.map(itemCard), "No items yet. Merchants can list the first one.");
    if (!account) return;

    const mine = await c.orderIdsOfBuyer(account);
    const mineOrders = await Promise.all(mine.map((id) => c.getOrder(id)));
    fill($("myOrders"), mineOrders.reverse().map((o) => orderCard(o, "buyer")), "No orders from this wallet yet.");

    const isM = await c.isMerchant(account);
    $("register").hidden = isM; $("dash").hidden = !isM;
    if (isM) {
      const ids = await c.itemIdsOf(account);
      const its = await Promise.all(ids.map((id) => c.getItem(id)));
      fill($("myItems"), its.map(myItemRow), "You haven't listed anything yet.");
      const oids = await c.orderIdsOfMerchant(account);
      const ords = await Promise.all(oids.map((id) => c.getOrder(id)));
      fill($("incoming"), ords.reverse().map((o) => orderCard(o, "merchant")), "No orders yet.");
    }
  }

  // ── Events ──
  let target;
  function openOrder(it) {
    target = it;
    $("dlgTitle").textContent = "Order " + it.name;
    $("ordQty").max = it.stock.toString();
    $("orderDialog").showModal();
  }
  $("orderForm").addEventListener("submit", (e) => {
    if (e.submitter?.value !== "ok") return;
    run("Place order", () => rw.placeOrder(target.id, $("ordQty").value, $("ordRef").value.trim()));
  });
  $("registerForm").addEventListener("submit", (e) => { e.preventDefault(); run("Register", () => rw.registerMerchant($("regName").value.trim())); });
  $("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    run("Add item", async () => { const tx = await rw.addItem($("addName").value.trim(), $("addPrice").value, $("addStock").value); e.target.reset(); return tx; });
  });
  $("lookup").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const c = account ? rw : ro();
      const o = await c.getOrder($("lookupId").value);
      $("lookupResult").replaceChildren(orderCard(o, "buyer"));
    } catch (err) { $("lookupResult").replaceChildren(h("p", { class: "empty" }, "No order with that number.")); }
  });
  $("connect").addEventListener("click", connect);
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== b.dataset.tab));
  }));

  // Read-only browsing before a wallet is connected.
  (async () => {
    const configured = address !== "0x0000000000000000000000000000000000000000";
    if (!configured) return fill($("items"), [], "Set the deployed contract address in web/config.js.");
    if (window.ethereum) { provider = new ethers.BrowserProvider(window.ethereum); try { await refresh(); } catch (e) { console.error(e); } }
    else fill($("items"), [], "Install a wallet to browse the catalog.");
  })();
})();
