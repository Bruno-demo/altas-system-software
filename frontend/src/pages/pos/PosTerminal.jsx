// What this does: cashier can search products, add to cart, and checkout to create an invoice
import { useEffect, useMemo, useState } from "react";
import { createSale, fetchReceiptHtml, searchProducts } from "../../api/sales";
import { listLocations } from "../../api/inventory";

function money(n) {
  const value = Number(n || 0);
  if (Number.isNaN(value)) return "0.00";
  return value.toFixed(2);
}

export default function PosTerminal() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState("");

  const [cart, setCart] = useState([]); // { key, product, locationId, binId, binCode, qty, unitPrice, discount }
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [buyerType, setBuyerType] = useState("INDIVIDUAL");
  const [buyerTin, setBuyerTin] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [note, setNote] = useState("");

  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listLocations()
      .then((res) => {
        const payload = res.data || [];
        setLocations(payload);
        setSelectedLocationId((prev) => prev || (payload[0]?.id || ""));
      })
      .catch((err) => {
        console.error("Failed to load locations", err);
      });
  }, []);

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    cart.forEach((item) => {
      subtotal += Number(item.unitPrice || 0) * Number(item.qty || 0);
      discountTotal += Number(item.discount || 0);
    });
    const total = Math.max(subtotal - discountTotal, 0);
    return { subtotal, discountTotal, total };
  }, [cart]);

  const doSearch = async (e) => {
    e.preventDefault();
    setMsg("");

    if (!q.trim()) {
      setMsg("Type a product name, part number, brand, or category first.");
      return;
    }

    try {
      const res = await searchProducts(q.trim(), selectedLocationId || undefined);
      setResults(res.data?.rows || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Search failed");
    }
  };

  const addToCart = (row) => {
    setMsg("");

    const product = row.product;
    const rec = row.recommended;
    const isMotorbike =
      product?.category === "Motorbike" || Boolean(product?.chassisNumber);

    if (!rec && !isMotorbike) {
      setMsg(
        `No recommended bin found for "${product?.name || "this product"}".`
      );
      return;
    }

    if (
      !isMotorbike &&
      selectedLocationId &&
      rec?.locationId &&
      rec.locationId !== selectedLocationId
    ) {
      setMsg(
        `Selected location does not match stock location for "${product?.name || "this product"}". Search again after changing location.`
      );
      return;
    }

    const locationId = isMotorbike ? null : rec?.locationId || selectedLocationId;
    if (!isMotorbike && !locationId) {
      setMsg("Select a location before adding this product.");
      return;
    }

    // What this does: use product + location + bin as unique key (motorbikes reuse the location)
    const binKey = isMotorbike ? "MOTORBIKE" : rec.binId;
    const locationKey = isMotorbike ? "MOTORBIKE" : locationId;
    const key = `${product.id}:${locationKey}:${binKey}`;

    setCart((prev) => {
      const found = prev.find((item) => item.key === key);
      if (found) {
        return prev.map((item) =>
          item.key === key ? { ...item, qty: Number(item.qty) + 1 } : item
        );
      }
      return [
        ...prev,
        {
          key,
          product,
          locationId,
          binId: rec?.binId || null,
          binCode: rec?.binCode || "MOTORBIKE",
          qty: 1,
          unitPrice: Number(product.sellPrice || 0),
          discount: 0,
          isMotorbike,
        },
      ];
    });
  };

  const updateCart = (key, patch) => {
    setCart((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (key) =>
    setCart((prev) => prev.filter((item) => item.key !== key));

  const clearCart = () => setCart([]);

  const resetSaleState = () => {
    setQ("");
    setResults([]);
    clearCart();
    setPaymentMethod("CASH");
    setBuyerType("INDIVIDUAL");
    setBuyerTin("");
    setBuyerName("");
    setBuyerPhone("");
    setNote("");
  };

  const printReceipt = async (saleId) => {
    // What this does: fetches protected HTML using Axios (with token), then prints from a new window
    const res = await fetchReceiptHtml(saleId);
    const html = res.data;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Popup blocked. Allow popups to print receipt.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Small delay helps browser render before printing
    setTimeout(() => win.print(), 300);
  };

  const checkout = async () => {
    setMsg("");

    if (cart.length === 0) return setMsg("Cart is empty.");
    if (!paymentMethod) return setMsg("Choose a payment method.");

    if (buyerType === "COMPANY" && !buyerTin.trim()) {
      return setMsg("Buyer TIN is required for COMPANY.");
    }

    setLoading(true);
    try {
      const payload = {
        paymentMethod,
        note: note.trim() || undefined,
        buyerType,
        buyerTin: buyerTin.trim() || undefined,
        buyerName: buyerName.trim() || undefined,
        buyerPhone: buyerPhone.trim() || undefined,
          items: cart.map((item) => ({
            productId: item.product.id,
            locationId: item.locationId || undefined,
            binId: item.binId || undefined,
            quantity: Number(item.qty),
            unitPrice: Number(item.unitPrice),
            discount: Number(item.discount || 0),
          })),
      };

      const res = await createSale(payload);

      resetSaleState();

      // Print receipt immediately
      await printReceipt(res.data.id);

      setMsg(`Sale created: ${res.data.invoiceNo}`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  const isSuccess = msg.startsWith("Sale created");

  useEffect(() => {
    if (!msg.startsWith("Sale created")) return;
    const timer = setTimeout(() => setMsg(""), 3000);
    return () => clearTimeout(timer);
  }, [msg]);

  return (
    <div className="page pos-terminal-page">
      <div className="pos-terminal-grid">
        {/* LEFT: Search */}
        <section className="card pos-terminal-panel">
          <h2 className="pos-terminal-title">POS Terminal</h2>

          <div className="pos-terminal-location">
            <label className="field">
              Location
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  setResults([]);
                }}
              >
                {locations.length === 0 ? (
                  <option value="">Loading locations...</option>
                ) : (
                  locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          {msg ? (
            <div
              className={`${
                isSuccess ? "success" : "alert"
              } pos-terminal-alert`}
            >
              {msg}
            </div>
          ) : null}

          <form onSubmit={doSearch} className="pos-terminal-search-form">
            <input
              className="pos-terminal-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search: name / sku / part number / brand / category"
            />
            <button type="submit">Search</button>
          </form>

          <div className="pos-terminal-results">
            {results.map((row, index) => {
              const product = row.product || {};
              const isMotorbike =
                product.category === "Motorbike" || Boolean(product.chassisNumber);
              const locationMismatch =
                !isMotorbike &&
                Boolean(selectedLocationId) &&
                Boolean(row.recommended?.locationId) &&
                row.recommended.locationId !== selectedLocationId;
              const availability = row.availability || {};
              const totalQty = Number(availability.totalQty || 0);
              const status = isMotorbike
                ? "AVAILABLE"
                : availability.status ||
                  (totalQty > 0 ? "AVAILABLE" : "OUT_OF_STOCK");
              const qtyLabel = isMotorbike ? "N/A" : totalQty;

              return (
                <div
                  key={product.id || `${product.sku || "row"}-${index}`}
                  className="pos-terminal-result"
                >
                  <div className="pos-terminal-result-row">
                    <div>
                      <div className="pos-terminal-result-title">
                        {product.name || "-"}
                      </div>
                      <div className="pos-terminal-result-meta">
                        Part: {product.partNumber || "-"} - Brand:{" "}
                        {product.brand || "-"} - Cat: {product.category || "-"}
                      </div>
                      <div className="pos-terminal-result-availability">
                        Availability: <strong>{qtyLabel}</strong> pcs -{" "}
                        <span className="pos-terminal-result-status">
                          {status}
                        </span>
                        {row.recommended ? (
                          <span className="pos-terminal-result-bin">
                            {" "}
                            - Suggested BIN:{" "}
                            <strong>{row.recommended.binCode}</strong>
                          </span>
                        ) : isMotorbike ? (
                          <span className="pos-terminal-result-bin">
                            {" "}
                            - No bin needed
                          </span>
                        ) : (
                          <span className="pos-terminal-result-bin-missing">
                            {" "}
                            - No bin suggestion
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => addToCart(row)}
                      disabled={(!row.recommended && !isMotorbike) || locationMismatch}
                      className="pos-terminal-add"
                    >
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* RIGHT: Cart */}
        <section className="card pos-terminal-panel">
          <h3 className="pos-terminal-subtitle">Cart</h3>

          {cart.length === 0 ? (
            <div className="muted pos-terminal-cart-empty">
              No items yet. Search and click Add.
            </div>
          ) : (
            <div className="pos-terminal-cart-list">
              {cart.map((item) => (
                <div key={item.key} className="pos-terminal-cart-item">
                  <div className="pos-terminal-cart-row">
                    <div>
                      <div className="pos-terminal-cart-title">
                        {item.product.name}
                      </div>
                      <div className="muted pos-terminal-cart-bin">
                        BIN: {item.binCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="pos-terminal-remove"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="pos-terminal-cart-grid">
                    <label className="field">
                      Qty
                      <input
                        value={item.qty}
                        type="number"
                        min={1}
                        onChange={(e) =>
                          updateCart(item.key, {
                            qty: Number(e.target.value || 1),
                          })
                        }
                      />
                    </label>

                    <label className="field">
                      Unit price
                      <input
                        value={item.unitPrice}
                        type="number"
                        min={0}
                        onChange={(e) =>
                          updateCart(item.key, {
                            unitPrice: Number(e.target.value || 0),
                          })
                        }
                      />
                    </label>

                    <label className="field">
                      Discount (line)
                      <input
                        value={item.discount}
                        type="number"
                        min={0}
                        onChange={(e) =>
                          updateCart(item.key, {
                            discount: Number(e.target.value || 0),
                          })
                        }
                      />
                    </label>

                    <div className="pos-terminal-line-total">
                      Line total
                      <div className="pos-terminal-line-total-value">
                        {money(
                          Math.max(
                            Number(item.unitPrice) * Number(item.qty) -
                              Number(item.discount || 0),
                            0
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pos-terminal-divider" />

          {/* Checkout */}
          <div className="pos-terminal-checkout">
            <div className="pos-terminal-checkout-grid">
              <label className="field">
                Payment
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="CASH">CASH</option>
                  <option value="MOMO">MOMO</option>
                  <option value="CARD">CARD</option>
                  <option value="BANK">BANK</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </label>

              <label className="field">
                Buyer type
                <select
                  value={buyerType}
                  onChange={(e) => setBuyerType(e.target.value)}
                >
                  <option value="INDIVIDUAL">INDIVIDUAL</option>
                  <option value="COMPANY">COMPANY (TIN)</option>
                </select>
              </label>
            </div>

            <label className="field">
              {buyerType === "COMPANY"
                ? "Buyer TIN (required for company)"
                : "Buyer TIN (optional)"}
              <input
                value={buyerTin}
                onChange={(e) => setBuyerTin(e.target.value)}
              />
            </label>

            <label className="field">
              Buyer name (optional)
              <input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </label>

            <label className="field">
              Buyer phone (optional)
              <input
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
              />
            </label>

            <label className="field">
              Note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="pos-terminal-divider pos-terminal-divider-tight" />

            <div className="pos-terminal-summary">
              <div className="pos-terminal-summary-row">
                <span>Subtotal</span>
                <strong>{money(totals.subtotal)}</strong>
              </div>
              <div className="pos-terminal-summary-row">
                <span>Discount</span>
                <strong>{money(totals.discountTotal)}</strong>
              </div>
              <div className="pos-terminal-summary-row pos-terminal-summary-total">
                <span>Total</span>
                <strong>{money(totals.total)}</strong>
              </div>
            </div>

            <div className="pos-terminal-actions">
              <button
                type="button"
                onClick={clearCart}
                disabled={cart.length === 0 || loading}
                className="pos-terminal-action pos-terminal-clear"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={checkout}
                disabled={cart.length === 0 || loading}
                className="pos-terminal-action pos-terminal-checkout-button"
              >
                {loading ? "Processing..." : "Checkout and Print"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
