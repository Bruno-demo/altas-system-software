// What this does: shows stock valuation totals by location/category
import { useEffect, useMemo, useState } from "react";
import { getStockValuation } from "../../api/manager";
import { listLocations } from "../../api/inventory";

function money(n) {
  const value = Number(n || 0);
  if (Number.isNaN(value)) return "0.00";
  return value.toFixed(2);
}

export default function StockValuation() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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

  const loadValuation = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await getStockValuation(
        locationId ? { locationId } : undefined
      );
      setData(res.data || null);
      setSelected(null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load valuation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadValuation();
  }, [locationId]);

  const applySearch = (event) => {
    event.preventDefault();
    setQ(qInput.trim());
  };

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!q) return data.rows;
    const qLower = q.toLowerCase();
    return data.rows.filter((row) => {
      const p = row.product || {};
      return (
        p.name?.toLowerCase().includes(qLower) ||
        p.sku?.toLowerCase().includes(qLower) ||
        p.partNumber?.toLowerCase().includes(qLower) ||
        p.brand?.toLowerCase().includes(qLower) ||
        p.category?.toLowerCase().includes(qLower)
      );
    });
  }, [data, q]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Stock Valuation</h2>
          <p className="muted">Estimated value based on cost and sell prices.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadValuation}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid" onSubmit={applySearch}>
        <label className="field">
          Location
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
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
          Search product
          <input
            placeholder="Name, SKU, part number"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </label>
        <div className="filter-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Search"}
          </button>
        </div>
      </form>

      {data ? (
        <div className="cards-grid">
          <section className="card">
            <h3>Totals</h3>
            <div className="stat-grid">
              <div>
                <div className="stat-label">Distinct Products</div>
                <div className="stat-value">{data.totals?.distinctProducts}</div>
              </div>
              <div>
                <div className="stat-label">Total Qty</div>
                <div className="stat-value">{data.totals?.totalQty}</div>
              </div>
              <div>
                <div className="stat-label">Cost Value</div>
                <div className="stat-value">
                  {money(data.totals?.totalCostValue)}
                </div>
              </div>
              <div>
                <div className="stat-label">Sell Value</div>
                <div className="stat-value">
                  {money(data.totals?.totalSellValue)}
                </div>
              </div>
              <div>
                <div className="stat-label">Potential Profit</div>
                <div className="stat-value">
                  {money(data.totals?.potentialGrossProfit)}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h3>By Category</h3>
            {data.byCategory?.length ? (
              <div className="table-compact">
                {data.byCategory.map((row) => (
                  <div key={row.category} className="table-row">
                    <span>{row.category}</span>
                    <span>Qty {row.qty}</span>
                    <span>Cost {money(row.costValue)}</span>
                    <span>Sell {money(row.sellValue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No category data.</div>
            )}
          </section>
        </div>
      ) : null}

      <div className="split-view">
        <section className="card list-panel">
          <h3>Valuation Rows</h3>
          <div className="data-table">
            <div className="data-row data-header">
              <div>Product</div>
              <div>Qty</div>
              <div>Cost</div>
              <div>Sell</div>
              <div>Cost Value</div>
              <div>Sell Value</div>
            </div>
            {loading ? (
              <div className="muted">Loading valuation...</div>
            ) : filteredRows.length ? (
              filteredRows.map((row, idx) => (
                <button
                  type="button"
                  key={row.product?.id || idx}
                  className={`data-row data-button ${
                    selected?.product?.id === row.product?.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <div>
                    {row.product?.name} ({row.product?.sku})
                  </div>
                  <div>{row.qty}</div>
                  <div>{money(row.costPrice)}</div>
                  <div>{money(row.sellPrice)}</div>
                  <div>{money(row.costValue)}</div>
                  <div>{money(row.sellValue)}</div>
                </button>
              ))
            ) : (
              <div className="muted">No valuation rows.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Product Valuation</h3>
          {selected ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Product</div>
                <div className="stat-value">{selected.product?.name}</div>
              </div>
              <div>
                <div className="stat-label">SKU</div>
                <div className="stat-value">{selected.product?.sku}</div>
              </div>
              <div>
                <div className="stat-label">Category</div>
                <div className="stat-value">{selected.product?.category || "-"}</div>
              </div>
              <div>
                <div className="stat-label">Qty</div>
                <div className="stat-value">{selected.qty}</div>
              </div>
              <div>
                <div className="stat-label">Cost Value</div>
                <div className="stat-value">{money(selected.costValue)}</div>
              </div>
              <div>
                <div className="stat-label">Sell Value</div>
                <div className="stat-value">{money(selected.sellValue)}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Select a row to preview.</div>
          )}
        </section>
      </div>
    </div>
  );
}
