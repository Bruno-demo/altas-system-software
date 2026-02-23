// What this does: shows inventory by product/location/bin with filters and preview
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getProductAvailability,
  listBins,
  listInventory,
  listLocations,
} from "../../api/inventory";

export default function Inventory() {
  const navigate = useNavigate();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");

  const [locations, setLocations] = useState([]);
  const [bins, setBins] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [selected, setSelected] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const res = await listLocations();
        setLocations(res.data || []);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load locations.");
      }
    };
    loadLocations();
  }, []);

  useEffect(() => {
    const loadBins = async () => {
      try {
        const res = await listBins(locationId ? { locationId } : undefined);
        setBins(res.data || []);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load bins.");
      }
    };
    loadBins();
  }, [locationId]);

  const loadInventory = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listInventory({
        q: q.trim() || undefined,
        locationId: locationId || undefined,
        binId: binId || undefined,
      });
      setRows(res.data || []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [q, locationId, binId]);

  const handleSearch = (event) => {
    event.preventDefault();
    setQ(qInput);
  };

  const handleSelect = (row) => {
    setSelected(row);
    setAvailability(null);
  };

  const loadAvailability = async () => {
    if (!selected?.product?.id) return;
    setLoadingAvailability(true);
    setMessage("");
    try {
      const res = await getProductAvailability(selected.product.id, {
        locationId: selected.location?.id,
        preferLocationId: selected.location?.id,
      });
      setAvailability(res.data || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load availability.");
    } finally {
      setLoadingAvailability(false);
    }
  };

  const openAdjustment = (action) => {
    if (!selected) return;
    navigate("/stock/adjustments", {
      state: {
        action,
        product: selected.product,
        locationId: selected.location?.id || "",
        binId: selected.bin?.id || "",
      },
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Inventory</h2>
          <p className="muted">Track quantities by location and bin.</p>
        </div>
        <div className="button-row">
          <Link className="button-outline" to="/stock/adjustments">
            Stock Adjustments
          </Link>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid" onSubmit={handleSearch}>
        <label className="field">
          Search
          <input
            placeholder="SKU, name, part number, brand"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </label>
        <label className="field">
          Location
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setBinId("");
            }}
          >
            <option value="">All</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Bin
          <select value={binId} onChange={(e) => setBinId(e.target.value)}>
            <option value="">All</option>
            {bins.map((bin) => (
              <option key={bin.id} value={bin.id}>
                {bin.code}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <button type="submit">Apply Filters</button>
        </div>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">Items: {rows.length}</div>
            <button type="button" className="button-outline" onClick={loadInventory}>
              Refresh
            </button>
          </div>
          <div className="data-table">
            <div className="data-row data-header">
              <div>Product</div>
              <div>Location</div>
              <div>Bin</div>
              <div>Qty</div>
              <div>Status</div>
            </div>
            {loading ? (
              <div className="muted">Loading inventory...</div>
            ) : rows.length ? (
              rows.map((row) => {
                const isLow =
                  Number(row.quantity || 0) <= Number(row.product?.minStock || 0);
                return (
                  <button
                    type="button"
                    key={row.id}
                    className={`data-row data-button ${
                      row.id === selected?.id ? "data-selected" : ""
                    }`}
                    onClick={() => handleSelect(row)}
                  >
                    <div>
                      {row.product?.name} ({row.product?.sku})
                    </div>
                    <div>{row.location?.name || "-"}</div>
                    <div>{row.bin?.code || "-"}</div>
                    <div>{row.quantity}</div>
                    <div className={`badge ${isLow ? "badge-warn" : ""}`}>
                      {isLow ? "LOW" : "OK"}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="muted">No inventory records.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Inventory Preview</h3>
          {selected ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">SKU</div>
                  <div className="stat-value">{selected.product?.sku}</div>
                </div>
                <div>
                  <div className="stat-label">Product</div>
                  <div className="stat-value">{selected.product?.name}</div>
                </div>
                <div>
                  <div className="stat-label">Location</div>
                  <div className="stat-value">{selected.location?.name}</div>
                </div>
                <div>
                  <div className="stat-label">Bin</div>
                  <div className="stat-value">{selected.bin?.code || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Quantity</div>
                  <div className="stat-value">{selected.quantity}</div>
                </div>
                <div>
                  <div className="stat-label">Min Stock</div>
                  <div className="stat-value">{selected.product?.minStock}</div>
                </div>
              </div>

              <button
                type="button"
                className="button-outline"
                onClick={loadAvailability}
                disabled={loadingAvailability}
              >
                {loadingAvailability ? "Loading..." : "Load Availability"}
              </button>

              {availability ? (
                <div className="card muted-block">
                  <div className="stat-grid">
                    <div>
                      <div className="stat-label">Total Qty</div>
                      <div className="stat-value">
                        {availability.totalQuantity}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Status</div>
                      <div className="stat-value">
                        {availability.available ? "AVAILABLE" : "OUT"}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Top Bin</div>
                      <div className="stat-value">
                        {availability.topBinSuggestion?.binCode || "-"}
                      </div>
                    </div>
                  </div>
                  <div className="table-compact">
                    {availability.pickFrom?.map((row, idx) => (
                      <div key={idx} className="table-row">
                        <div>{row.locationName}</div>
                        <div>BIN {row.binCode || "-"}</div>
                        <div>{row.quantity}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="muted">Load availability to see bins.</div>
              )}

              <div className="button-row">
                <button type="button" onClick={() => openAdjustment("IN")}>
                  Stock In
                </button>
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => openAdjustment("OUT")}
                >
                  Stock Out
                </button>
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => openAdjustment("DAMAGE")}
                >
                  Damage
                </button>
              </div>
            </div>
          ) : (
            <div className="muted">Select an inventory row to preview.</div>
          )}
        </section>
      </div>
    </div>
  );
}
