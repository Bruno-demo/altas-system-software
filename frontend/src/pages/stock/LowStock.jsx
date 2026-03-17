// What this does: shows low-stock items with optional aggregation
import { useEffect, useMemo, useState } from "react";
import { listLocations, listLowStock } from "../../api/inventory";

export default function LowStock() {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [aggregate, setAggregate] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [mode, setMode] = useState("PER_LOCATION");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

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

  const loadLowStock = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listLowStock({
        locationId: locationId || undefined,
        aggregate: aggregate ? "true" : undefined,
      });
      setRows(Array.isArray(res.data?.items) ? res.data.items : []);
      setMode(res.data?.mode || "PER_LOCATION");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load low stock.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLowStock();
  }, [locationId, aggregate]);

  const totalPages = Math.max(Math.ceil(rows.length / limit), 1);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * limit;
    return rows.slice(start, start + limit);
  }, [rows, page, limit]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Low Stock</h2>
          <p className="muted">Items below minimum stock level.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadLowStock}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid">
        <label className="field">
          Location
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(1);
            }}
            disabled={aggregate}
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
          Aggregated view
          <select
            value={aggregate ? "true" : "false"}
            onChange={(e) => {
              setAggregate(e.target.value === "true");
              setPage(1);
            }}
          >
            <option value="false">Per location</option>
            <option value="true">All locations</option>
          </select>
        </label>
        <label className="field">
          Row limit
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="data-table">
            <div className="data-row data-header">
              <div>Product</div>
              {mode === "PER_LOCATION" ? <div>Location</div> : null}
              <div>Qty</div>
              <div>Min Stock</div>
            </div>
            {loading ? (
              <div className="muted">Loading...</div>
            ) : pagedRows.length ? (
              pagedRows.map((row, idx) => {
                const product = row.product || {};
                const qty =
                  mode === "PER_LOCATION"
                    ? row.quantity
                    : row.totalQuantity;
                const key = `${product.id || "row"}-${(page - 1) * limit + idx}`;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`data-row data-button ${
                      selectedKey === key ? "data-selected" : ""
                    }`}
                    onClick={() => {
                      setSelected(row);
                      setSelectedKey(key);
                    }}
                  >
                    <div>
                      {product.name} ({product.sku})
                    </div>
                    {mode === "PER_LOCATION" ? (
                      <div>{row.location?.name || "-"}</div>
                    ) : null}
                    <div>{qty}</div>
                    <div>{product.minStock}</div>
                  </button>
                );
              })
            ) : (
              <div className="muted">No low stock items.</div>
            )}
          </div>
          <div className="table-toolbar">
            <div className="pagination">
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1 || loading}
              >
                Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page >= totalPages || loading}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Low Stock Preview</h3>
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
                <div className="stat-label">Quantity</div>
                <div className="stat-value">
                  {mode === "PER_LOCATION"
                    ? selected.quantity
                    : selected.totalQuantity}
                </div>
              </div>
              <div>
                <div className="stat-label">Min Stock</div>
                <div className="stat-value">{selected.product?.minStock}</div>
              </div>
              {mode === "PER_LOCATION" ? (
                <div>
                  <div className="stat-label">Location</div>
                  <div className="stat-value">
                    {selected.location?.name || "-"}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="muted">Select an item to preview.</div>
          )}
        </section>
      </div>
    </div>
  );
}
