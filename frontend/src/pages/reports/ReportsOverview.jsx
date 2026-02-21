// What this does: shows KPI + summary snapshots for Manager/CEO
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getKpis } from "../../api/manager";
import { getCashflow, getStockMovement, getSummary } from "../../api/reports";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

export default function ReportsOverview() {
  const [period, setPeriod] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState({ period: "today" });

  const [kpis, setKpis] = useState(null);
  const [summary, setSummary] = useState(null);
  const [cashflow, setCashflow] = useState(null);
  const [movement, setMovement] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const applyFilters = (event) => {
    event.preventDefault();
    setMessage("");
    if (period === "custom") {
      if (!from || !to) {
        setMessage("Select both From and To dates.");
        return;
      }
      setFilters({ from, to });
    } else {
      setFilters({ period });
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");
      try {
        const [kpiRes, summaryRes, cashflowRes, movementRes] =
          await Promise.all([
            getKpis(filters),
            getSummary(filters),
            getCashflow(filters),
            getStockMovement(filters),
          ]);
        setKpis(kpiRes.data || null);
        setSummary(summaryRes.data || null);
        setCashflow(cashflowRes.data || null);
        setMovement(movementRes.data || null);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load reports.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters]);

  const cashInflow = cashflow?.inflow?.salesTotal ?? cashflow?.totals?.inflow ?? 0;
  const cashOutflow =
    cashflow?.outflow?.expensesTotal ??
    cashflow?.outflow?.total ??
    cashflow?.totals?.outflow ??
    cashflow?.outflow?.stockPurchasesEstimated ??
    0;
  const cashNet =
    cashflow?.net ??
    cashflow?.totals?.net ??
    (Number(cashInflow || 0) - Number(cashOutflow || 0));
  const cashOutflowLabel =
    cashflow?.outflow?.expensesTotal != null ||
    cashflow?.outflow?.total != null ||
    cashflow?.totals?.outflow != null
      ? "Outflow (Expenses)"
      : "Outflow (Est.)";

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Reports Overview</h2>
          <p className="muted">KPIs, sales health, and movement snapshots.</p>
        </div>
        <div className="button-row">
          <Link className="button-outline" to="/reports/expenses">
            Expenses
          </Link>
          <Link className="button-outline" to="/reports/sales">
            Sales Reports
          </Link>
          <Link className="button-outline" to="/reports/ebm">
            EBM Dashboard
          </Link>
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
          <h3>KPIs</h3>
          {kpis ? (
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="stat-label">Invoices</div>
                <div className="stat-value">{kpis.kpis?.salesCount}</div>
              </div>
              <div className="kpi-card">
                <div className="stat-label">Revenue</div>
                <div className="stat-value">{kpis.kpis?.revenue}</div>
              </div>
              <div className="kpi-card">
                <div className="stat-label">Profit (Est.)</div>
                <div className="stat-value">{kpis.kpis?.profitEstimate}</div>
              </div>
              <div className="kpi-card">
                <div className="stat-label">Returns</div>
                <div className="stat-value">{kpis.kpis?.returnsCount}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No KPI data.</div>
          )}
        </section>

        <section className="card">
          <h3>Sales Summary</h3>
          {summary ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Invoices</div>
                <div className="stat-value">{summary.sales?.invoices}</div>
              </div>
              <div>
                <div className="stat-label">Subtotal</div>
                <div className="stat-value">{summary.sales?.subtotal}</div>
              </div>
              <div>
                <div className="stat-label">Discount</div>
                <div className="stat-value">{summary.sales?.discountTotal}</div>
              </div>
              <div>
                <div className="stat-label">Tax</div>
                <div className="stat-value">{summary.sales?.taxTotal}</div>
              </div>
              <div>
                <div className="stat-label">Total</div>
                <div className="stat-value">{summary.sales?.total}</div>
              </div>
              <div>
                <div className="stat-label">Returns</div>
                <div className="stat-value">{summary.returns?.count}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No summary data.</div>
          )}
        </section>

        <section className="card">
          <h3>Cashflow</h3>
          {cashflow ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Inflow</div>
                <div className="stat-value">{cashInflow}</div>
              </div>
              <div>
                <div className="stat-label">{cashOutflowLabel}</div>
                <div className="stat-value">{cashOutflow}</div>
              </div>
              <div>
                <div className="stat-label">Net</div>
                <div className="stat-value">{cashNet}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No cashflow data.</div>
          )}
        </section>

        <section className="card">
          <h3>Stock Movement</h3>
          {movement ? (
            <div className="table-compact">
              {(movement.movement || []).map((row) => (
                <div key={row.type} className="table-row">
                  <span>{row.type}</span>
                  <span>{row.transactions} tx</span>
                  <span>Qty {row.quantity}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No movement data.</div>
          )}
        </section>
      </div>

      <div className="split-view">
        <section className="card list-panel">
          <h3>Payment Split</h3>
          {kpis?.paymentSplit?.length ? (
            <div className="table-compact">
              {kpis.paymentSplit.map((row) => (
                <div key={row.paymentMethod} className="table-row">
                  <span>{row.paymentMethod}</span>
                  <span>{row.count} invoices</span>
                  <span>{row.amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No payment data.</div>
          )}
        </section>

        <section className="card preview-panel">
          <h3>EBM Summary</h3>
          {kpis?.ebmSummary?.length ? (
            <div className="table-compact">
              {kpis.ebmSummary.map((row) => (
                <div key={row.ebmStatus} className="table-row">
                  <span>{row.ebmStatus}</span>
                  <span>{row.count} invoices</span>
                  <span>{row.amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No EBM data.</div>
          )}
        </section>
      </div>

      <div className="split-view">
        <section className="card list-panel">
          <h3>Best Sellers</h3>
          {kpis?.bestSellers?.length ? (
            <div className="table-compact">
              {kpis.bestSellers.slice(0, 5).map((row) => (
                <div key={row.product?.id} className="table-row">
                  <span>{row.product?.name}</span>
                  <span>Qty {row.qty}</span>
                  <span>{row.amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No best sellers yet.</div>
          )}
        </section>

        <section className="card preview-panel">
          <h3>Low Stock Alerts</h3>
          {kpis?.lowStock?.length ? (
            <div className="table-compact">
              {kpis.lowStock.slice(0, 5).map((row) => (
                <div key={row.product?.id} className="table-row">
                  <span>{row.product?.name}</span>
                  <span>Qty {row.totalQty}</span>
                  <span>Min {row.minStock}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No low stock alerts.</div>
          )}
        </section>
      </div>
    </div>
  );
}
