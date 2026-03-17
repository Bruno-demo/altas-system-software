// What this does: provides stock IN/OUT/DAMAGE actions using drawers
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  listBins,
  listLocations,
  stockDamage,
  stockIn,
  stockOut,
} from "../../api/inventory";
import Drawer from "../../components/Drawer";
import ProductPicker from "../../components/ProductPicker";

const emptyForm = {
  product: null,
  locationId: "",
  binId: "",
  quantity: "",
  unitCost: "",
  reason: "",
};
const createLine = () => ({
  product: null,
  binId: "",
  quantity: "",
  unitCost: "",
});

export default function StockAdjustments() {
  const location = useLocation();
  const prefillRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [bins, setBins] = useState([]);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [activeAction, setActiveAction] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stockInLocationId, setStockInLocationId] = useState("");
  const [stockInLines, setStockInLines] = useState([createLine()]);

  useEffect(() => {
    const prefill = location.state;
    if (!prefill?.product?.id) return;
    if (prefillRef.current === location.key) return;
    prefillRef.current = location.key;

    const action = prefill.action || "OUT";
    setActiveAction(action);
    setMessage("");
    setSuccess("");

    if (action === "IN") {
      setStockInLocationId(prefill.locationId || "");
      setStockInLines([
        { ...createLine(), product: prefill.product, binId: prefill.binId || "" },
      ]);
    } else {
      setForm({
        ...emptyForm,
        product: prefill.product,
        locationId: prefill.locationId || "",
        binId: prefill.binId || "",
      });
    }
  }, [location.key, location.state]);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const res = await listLocations();
        setLocations(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load locations.");
      }
    };
    loadLocations();
  }, []);

  useEffect(() => {
    const loadBins = async () => {
      try {
        const locationId =
          activeAction === "IN" ? stockInLocationId : form.locationId;
        const res = await listBins(
          locationId ? { locationId } : undefined
        );
        setBins(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load bins.");
      }
    };
    const locationId =
      activeAction === "IN" ? stockInLocationId : form.locationId;
    if (locationId) {
      loadBins();
    } else {
      setBins([]);
    }
  }, [activeAction, form.locationId, stockInLocationId]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const openDrawer = (action) => {
    setActiveAction(action);
    setForm(emptyForm);
    setStockInLocationId("");
    setStockInLines([createLine()]);
    setPickerTarget(null);
    setMessage("");
    setSuccess("");
  };

  const closeDrawer = () => {
    setActiveAction("");
    setForm(emptyForm);
    setStockInLocationId("");
    setStockInLines([createLine()]);
    setPickerTarget(null);
  };

  const submit = async () => {
    setLoading(true);
    setMessage("");
    setSuccess("");
    try {
      if (activeAction === "IN") {
        if (!stockInLocationId) {
          setMessage("Location is required.");
          return;
        }
        const prepared = stockInLines
          .map((line, index) => ({ ...line, index }))
          .filter((line) => line.product);

        if (!prepared.length) {
          setMessage("Select at least one product.");
          return;
        }

        for (const line of prepared) {
          const qty = Number(line.quantity);
          if (Number.isNaN(qty) || qty <= 0) {
            setMessage(`Quantity must be positive for line ${line.index + 1}.`);
            return;
          }
        }

        for (const line of prepared) {
          await stockIn({
            productId: line.product.id,
            locationId: stockInLocationId,
            binId: line.binId || undefined,
            quantity: Number(line.quantity),
            unitCost: line.unitCost ? Number(line.unitCost) : undefined,
          });
        }
        setSuccess(
          `Stock IN completed for ${prepared.length} product${
            prepared.length === 1 ? "" : "s"
          }.`
        );
      } else {
        const qty = Number(form.quantity);
        if (!form.product || !form.locationId || !form.quantity) {
          setMessage("Product, location, and quantity are required.");
          return;
        }
        if (Number.isNaN(qty) || qty <= 0) {
          setMessage("Quantity must be a positive number.");
          return;
        }
        if (
          (activeAction === "OUT" || activeAction === "DAMAGE") &&
          !form.binId
        ) {
          setMessage("Bin is required for this action.");
          return;
        }
        if (activeAction === "DAMAGE" && !form.reason.trim()) {
          setMessage("Reason is required for damage.");
          return;
        }

        const payload = {
          productId: form.product.id,
          locationId: form.locationId,
          binId: form.binId || undefined,
          quantity: Number(form.quantity),
          unitCost: form.unitCost ? Number(form.unitCost) : undefined,
          reason: form.reason.trim() || undefined,
        };

        if (activeAction === "OUT") {
          await stockOut(payload);
          setSuccess("Stock OUT completed.");
        } else if (activeAction === "DAMAGE") {
          await stockDamage(payload);
          setSuccess("Damage recorded.");
        }
      }
      closeDrawer();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Action failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Stock Adjustments</h2>
          <p className="muted">Record stock movements and corrections.</p>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="cards-grid">
        <section className="card action-card">
          <h3>Stock In</h3>
          <p className="muted">Receive new stock into a location or bin.</p>
          <button type="button" onClick={() => openDrawer("IN")}>
            Start Stock In
          </button>
        </section>
        <section className="card action-card">
          <h3>Stock Out</h3>
          <p className="muted">Remove stock from a specific bin.</p>
          <button type="button" onClick={() => openDrawer("OUT")}>
            Start Stock Out
          </button>
        </section>
        <section className="card action-card">
          <h3>Damage</h3>
          <p className="muted">Record damaged stock and reason.</p>
          <button type="button" onClick={() => openDrawer("DAMAGE")}>
            Record Damage
          </button>
        </section>
      </div>

      <Drawer
        open={Boolean(activeAction)}
        onClose={closeDrawer}
        title={
          activeAction === "IN"
            ? "Stock In"
            : activeAction === "OUT"
              ? "Stock Out"
              : "Damage"
        }
        footer={
          <div className="button-row">
            <button
              type="button"
              className="button-outline"
              onClick={closeDrawer}
            >
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={loading}>
              {loading ? "Saving..." : "Submit"}
            </button>
          </div>
        }
      >
        {activeAction === "IN" ? (
          <div className="form form-wide">
            <div className="field">
              <label>Location</label>
              <select
                value={stockInLocationId}
                onChange={(e) => {
                  setStockInLocationId(e.target.value);
                  setStockInLines((prev) =>
                    prev.map((line) => ({ ...line, binId: "" }))
                  );
                }}
              >
                <option value="">Select location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="stock-lines">
              {stockInLines.map((line, index) => (
                <div key={`line-${index}`} className="stock-line">
                  <div className="stock-line-fields">
                    <div className="field">
                      <label>Product</label>
                      <button
                        type="button"
                        className="button-outline"
                        onClick={() => {
                          setPickerTarget(index);
                          setPickerOpen(true);
                        }}
                      >
                        {line.product
                          ? `${line.product.name} (${line.product.sku})`
                          : "Select Product"}
                      </button>
                    </div>
                    <div className="field">
                      <label>Bin (optional)</label>
                      <select
                        value={line.binId}
                        onChange={(e) =>
                          setStockInLines((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? { ...item, binId: e.target.value }
                                : item
                            )
                          )
                        }
                      >
                        <option value="">Select bin</option>
                        {bins.map((bin) => (
                          <option key={bin.id} value={bin.id}>
                            {bin.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Quantity</label>
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          setStockInLines((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? { ...item, quantity: e.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Unit Cost (optional)</label>
                      <input
                        type="number"
                        value={line.unitCost}
                        onChange={(e) =>
                          setStockInLines((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? { ...item, unitCost: e.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                  {stockInLines.length > 1 ? (
                    <button
                      type="button"
                      className="button-link"
                      onClick={() =>
                        setStockInLines((prev) =>
                          prev.filter((_, idx) => idx !== index)
                        )
                      }
                    >
                      Remove line
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="button-outline"
              onClick={() =>
                setStockInLines((prev) => [...prev, createLine()])
              }
            >
              Add another product
            </button>
          </div>
        ) : (
          <div className="form">
            <div className="field">
              <label>Product</label>
              <button
                type="button"
                className="button-outline"
                onClick={() => setPickerOpen(true)}
              >
                {form.product
                  ? `${form.product.name} (${form.product.sku})`
                  : "Select Product"}
              </button>
            </div>
            <div className="field">
              <label>Location</label>
              <select
                value={form.locationId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    locationId: e.target.value,
                    binId: "",
                  }))
                }
              >
                <option value="">Select location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Bin (required)</label>
              <select
                value={form.binId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, binId: e.target.value }))
                }
              >
                <option value="">Select bin</option>
                {bins.map((bin) => (
                  <option key={bin.id} value={bin.id}>
                    {bin.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Quantity</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, quantity: e.target.value }))
                }
              />
            </div>
            {activeAction !== "IN" ? (
              <div className="field">
                <label>
                  Reason {activeAction === "DAMAGE" ? "(required)" : "(optional)"}
                </label>
                <input
                  value={form.reason}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                />
              </div>
            ) : null}
          </div>
        )}
      </Drawer>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(picked) => {
          if (activeAction === "IN") {
            if (pickerTarget == null) return;
            setStockInLines((prev) =>
              prev.map((line, idx) =>
                idx === pickerTarget ? { ...line, product: picked } : line
              )
            );
            setPickerTarget(null);
          } else {
            setForm((prev) => ({ ...prev, product: picked }));
          }
        }}
      />
    </div>
  );
}
