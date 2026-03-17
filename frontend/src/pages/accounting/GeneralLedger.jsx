import { useEffect, useMemo, useState } from "react";
import { getLedger, listAccounts } from "../../api/accounting";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom range" },
];

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function GeneralLedger() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1, limit: 50 });
  const [openingBalance, setOpeningBalance] = useState(0);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const rangeParams = useMemo(() => {
    if (period === "custom") return { from, to };
    return { period };
  }, [period, from, to]);

  const loadAccounts = async () => {
    try {
      const res = await listAccounts();
      setAccounts(res.data || []);
      if (!accountId && res.data?.length) {
        setAccountId(res.data[0].id);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load accounts.");
    }
  };

  const loadLedger = async () => {
    if (!accountId) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await getLedger({
        accountId,
        ...rangeParams,
        page,
        limit,
      });
      setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setMeta(res.data?.meta || { total: 0, page: 1, pages: 1, limit });
      setOpeningBalance(res.data?.openingBalance || 0);
      setTotals(res.data?.totals || { debit: 0, credit: 0 });
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load ledger.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadLedger();
  }, [accountId, page, limit, rangeParams]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    loadLedger();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>General Ledger</h2>
          <p className="muted">Track movements for a specific account.</p>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid" onSubmit={applyFilters}>
        <label className="field">
          Account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.code} - {acc.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={period !== "custom"}
          />
        </label>
        <label className="field">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={period !== "custom"}
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
            <option value={25}>25</option>
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

      <div className="card">
        <div className="stat-grid">
          <div>
            <div className="stat-label">Opening Balance</div>
            <div className="stat-value">{Number(openingBalance || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Total Debit</div>
            <div className="stat-value">{Number(totals.debit || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Total Credit</div>
            <div className="stat-value">{Number(totals.credit || 0).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="table-toolbar">
          <div className="muted">Total: {meta.total || 0}</div>
          <div className="button-row">
            <button
              type="button"
              className="button-outline"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1 || loading}
            >
              Prev
            </button>
            <div className="muted">
              Page {meta.page || page} / {meta.pages || 1}
            </div>
            <button
              type="button"
              className="button-outline"
              onClick={() => setPage((prev) => Math.min(prev + 1, meta.pages || 1))}
              disabled={page >= (meta.pages || 1) || loading}
            >
              Next
            </button>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row data-header ledger-row">
            <div>Date</div>
            <div>Source</div>
            <div>Reference</div>
            <div>Memo</div>
            <div>Debit</div>
            <div>Credit</div>
            <div>Running</div>
          </div>
          {loading ? (
            <div className="muted">Loading ledger...</div>
          ) : rows.length ? (
            rows.map((row) => (
              <div key={row.id} className="data-row ledger-row">
                <div>{toDateInput(row.date) || "-"}</div>
                <div>{row.source}</div>
                <div>{row.reference || "-"}</div>
                <div>{row.memo || "-"}</div>
                <div>{Number(row.debit || 0).toFixed(2)}</div>
                <div>{Number(row.credit || 0).toFixed(2)}</div>
                <div>{Number(row.runningBalance || 0).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <div className="muted">No ledger rows found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
