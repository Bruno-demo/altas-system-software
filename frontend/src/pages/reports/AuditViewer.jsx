// What this does: Manager/CEO audit viewer with filters and preview
import { useEffect, useState } from "react";
import { getAudit } from "../../api/manager";

export default function AuditViewer() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPages = meta?.pages || 1;

  const loadAudit = async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = {
        page,
        limit,
        category: category || undefined,
        userId: userId.trim() || undefined,
        action: action.trim() || undefined,
        q: q.trim() || undefined,
      };
      if (from && to) {
        params.from = from;
        params.to = to;
      }
      const res = await getAudit(params);
      setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setMeta(res.data?.meta || null);
      if (selected && !res.data?.rows?.some((r) => r.id === selected.id)) {
        setSelected(null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, [page, limit]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    loadAudit();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Audit Viewer</h2>
          <p className="muted">Track actions across the system.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadAudit}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid" onSubmit={applyFilters}>
        <label className="field">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="accounting">Accounting</option>
            <option value="stock">Stock</option>
            <option value="hr">HR</option>
            <option value="sales">Sales</option>
          </select>
        </label>
        <label className="field">
          User ID
          <input
            placeholder="Optional user id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </label>
        <label className="field">
          Action
          <input
            placeholder="Action contains"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
        <label className="field">
          Search
          <input
            placeholder="Search details"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
        <div className="filter-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Apply Filters"}
          </button>
        </div>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">
              {meta ? `Total: ${meta.total}` : "Audit logs"}
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
            <div className="data-row data-header audit-row">
              <div>Date</div>
              <div>User</div>
              <div>Action</div>
              <div>Details</div>
            </div>
            {loading ? (
              <div className="muted">Loading audit logs...</div>
            ) : rows.length ? (
              rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`data-row data-button audit-row ${
                    selected?.id === row.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <div>{new Date(row.createdAt).toLocaleString()}</div>
                  <div>{row.user?.fullName || "-"}</div>
                  <div>{row.action}</div>
                  <div className="truncate">{row.details || "-"}</div>
                </button>
              ))
            ) : (
              <div className="muted">No audit logs found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Audit Preview</h3>
          {selected ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Date</div>
                  <div className="stat-value">
                    {new Date(selected.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="stat-label">User</div>
                  <div className="stat-value">
                    {selected.user?.fullName || "-"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Role</div>
                  <div className="stat-value">{selected.user?.role || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Action</div>
                  <div className="stat-value">{selected.action}</div>
                </div>
              </div>
              <div>
                <div className="stat-label">Details</div>
                <div className="muted-block">{selected.details || "-"}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Select a log entry to preview.</div>
          )}
        </section>
      </div>
    </div>
  );
}
