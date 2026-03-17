// What this does: shows stock IN/OUT/DAMAGE transactions with filters and preview
import { useEffect, useState } from "react";
import { listLocations, listTransactions } from "../../api/inventory";
import ProductPicker from "../../components/ProductPicker";

export default function Transactions() {
  const [type, setType] = useState("");
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [product, setProduct] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [locations, setLocations] = useState([]);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const totalPages = meta?.pages || 1;

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

  const loadTransactions = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listTransactions({
        type: type || undefined,
        locationId: locationId || undefined,
        productId: product?.id || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit,
      });
      setRows(Array.isArray(res.data?.transactions) ? res.data.transactions : []);
      setMeta(res.data?.meta || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [type, locationId, product?.id, from, to, page, limit]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Stock Transactions</h2>
          <p className="muted">History of stock in/out/damage.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadTransactions}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid">
        <label className="field">
          Type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
            <option value="DAMAGE">DAMAGE</option>
          </select>
        </label>
        <label className="field">
          Location
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(1);
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
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="field">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="field">
          Product
          <button type="button" className="button-outline" onClick={() => setPickerOpen(true)}>
            {product ? `${product.name} (${product.sku})` : "Select Product"}
          </button>
          {product ? (
            <button
              type="button"
              className="button-link"
              onClick={() => {
                setProduct(null);
                setPage(1);
              }}
            >
              Clear
            </button>
          ) : null}
        </label>
        <label className="field">
          Limit
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">
              {meta ? `Total: ${meta.total}` : "Transactions"}
            </div>
            <div className="pagination">
              <button
                type="button"
                className="button-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="button-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                Next
              </button>
            </div>
          </div>
          <div className="data-table">
            <div className="data-row data-header">
              <div>Type</div>
              <div>Date</div>
              <div>Product</div>
              <div>Location</div>
              <div>Qty</div>
            </div>
            {loading ? (
              <div className="muted">Loading transactions...</div>
            ) : rows.length ? (
              rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`data-row data-button ${
                    row.id === selected?.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <div className="badge">{row.type}</div>
                  <div>{new Date(row.createdAt).toLocaleString()}</div>
                  <div>{row.product?.name}</div>
                  <div>{row.location?.name}</div>
                  <div>{row.quantity}</div>
                </button>
              ))
            ) : (
              <div className="muted">No transactions found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Transaction Preview</h3>
          {selected ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Type</div>
                <div className="stat-value">{selected.type}</div>
              </div>
              <div>
                <div className="stat-label">Date</div>
                <div className="stat-value">
                  {new Date(selected.createdAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="stat-label">Product</div>
                <div className="stat-value">{selected.product?.name}</div>
              </div>
              <div>
                <div className="stat-label">SKU</div>
                <div className="stat-value">{selected.product?.sku}</div>
              </div>
              <div>
                <div className="stat-label">Location</div>
                <div className="stat-value">{selected.location?.name}</div>
              </div>
              <div>
                <div className="stat-label">Quantity</div>
                <div className="stat-value">{selected.quantity}</div>
              </div>
              <div>
                <div className="stat-label">Reason</div>
                <div className="stat-value">{selected.reason || "-"}</div>
              </div>
              <div>
                <div className="stat-label">Created By</div>
                <div className="stat-value">{selected.user?.fullName}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Select a transaction to preview.</div>
          )}
        </section>
      </div>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(picked) => {
          setProduct(picked);
          setPage(1);
        }}
      />
    </div>
  );
}
