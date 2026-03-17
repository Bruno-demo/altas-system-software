import { useEffect, useMemo, useState } from "react";
import { getStatements } from "../../api/accounting";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom range" },
];

function money(value) {
  return Number(value || 0).toFixed(2);
}

export default function FinancialStatements() {
  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const rangeParams = useMemo(() => {
    if (period === "custom") return { from, to };
    return { period };
  }, [period, from, to]);

  const loadStatements = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await getStatements(rangeParams);
      setData(res.data || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load statements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatements();
  }, [rangeParams]);

  const applyFilters = (event) => {
    event.preventDefault();
    loadStatements();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Financial Statements</h2>
          <p className="muted">Profit & loss, balance sheet, and cash flow snapshot.</p>
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

      <div className="cards-grid">
        <section className="card">
          <h3>Profit & Loss</h3>
          {data ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Revenue</div>
                <div className="stat-value">{money(data.profitAndLoss?.revenue)}</div>
              </div>
              <div>
                <div className="stat-label">Expenses</div>
                <div className="stat-value">{money(data.profitAndLoss?.expenses)}</div>
              </div>
              <div>
                <div className="stat-label">Net Profit</div>
                <div className="stat-value">{money(data.profitAndLoss?.netProfit)}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No data.</div>
          )}
        </section>

        <section className="card">
          <h3>Balance Sheet</h3>
          {data ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Assets</div>
                <div className="stat-value">{money(data.balanceSheet?.assets)}</div>
              </div>
              <div>
                <div className="stat-label">Liabilities</div>
                <div className="stat-value">{money(data.balanceSheet?.liabilities)}</div>
              </div>
              <div>
                <div className="stat-label">Equity</div>
                <div className="stat-value">{money(data.balanceSheet?.equity)}</div>
              </div>
              <div>
                <div className="stat-label">Balance Check</div>
                <div className="stat-value">{money(data.balanceSheet?.balanceCheck)}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No data.</div>
          )}
        </section>

        <section className="card">
          <h3>Cash Flow</h3>
          {data ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Inflow</div>
                <div className="stat-value">{money(data.cashFlow?.inflow)}</div>
              </div>
              <div>
                <div className="stat-label">Outflow</div>
                <div className="stat-value">{money(data.cashFlow?.outflow)}</div>
              </div>
              <div>
                <div className="stat-label">Net</div>
                <div className="stat-value">{money(data.cashFlow?.net)}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No data.</div>
          )}
        </section>
      </div>
    </div>
  );
}
