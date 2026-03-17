import { useEffect, useMemo, useState } from "react";
import { getTrialBalance } from "../../api/accounting";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom range" },
];

export default function TrialBalance() {
  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const rangeParams = useMemo(() => {
    if (period === "custom") return { from, to };
    return { period };
  }, [period, from, to]);

  const loadTrialBalance = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await getTrialBalance(rangeParams);
      setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setTotals(res.data?.totals || { debit: 0, credit: 0 });
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load trial balance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrialBalance();
  }, [rangeParams]);

  const applyFilters = (event) => {
    event.preventDefault();
    loadTrialBalance();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Trial Balance</h2>
          <p className="muted">Balance debits and credits for the selected period.</p>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid" onSubmit={applyFilters}>
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
        <div className="filter-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Apply Filters"}
          </button>
        </div>
      </form>

      <section className="card">
        <div className="stat-grid">
          <div>
            <div className="stat-label">Total Debit</div>
            <div className="stat-value">{Number(totals.debit || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Total Credit</div>
            <div className="stat-value">{Number(totals.credit || 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="stat-label">Balanced</div>
            <div className="stat-value">
              {Math.abs(Number(totals.debit || 0) - Number(totals.credit || 0)) < 0.01 ? "Yes" : "No"}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="data-table">
          <div className="data-row data-header trial-row">
            <div>Code</div>
            <div>Account</div>
            <div>Type</div>
            <div>Debit</div>
            <div>Credit</div>
          </div>
          {loading ? (
            <div className="muted">Loading trial balance...</div>
          ) : rows.length ? (
            rows.map((row) => (
              <div key={row.accountId} className="data-row trial-row">
                <div>{row.code}</div>
                <div>{row.name}</div>
                <div>{row.type}</div>
                <div>{Number(row.debit || 0).toFixed(2)}</div>
                <div>{Number(row.credit || 0).toFixed(2)}</div>
              </div>
            ))
          ) : (
            <div className="muted">No trial balance rows found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
