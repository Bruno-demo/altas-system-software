// What this does: accountant landing page with finance-focused snapshots + links
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCashflow,
  getEbmSummary,
  getProfit,
  getSalesByPayment,
  getSummary,
} from "../../api/reports";
import { getExpensesSummary } from "../../api/expenses";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

export default function AccountantDashboard() {
  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState({ period: "this_month" });

  const [summary, setSummary] = useState(null);
  const [cashflow, setCashflow] = useState(null);
  const [paymentSplit, setPaymentSplit] = useState(null);
  const [profit, setProfit] = useState(null);
  const [ebmSummary, setEbmSummary] = useState(null);
  const [expenseSummary, setExpenseSummary] = useState(null);
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
        const [summaryRes, cashflowRes, payRes, profitRes, ebmRes, expRes] =
          await Promise.all([
            getSummary(filters),
            getCashflow(filters),
            getSalesByPayment(filters),
            getProfit(filters),
            getEbmSummary(filters),
            getExpensesSummary(filters),
          ]);
        setSummary(summaryRes.data || null);
        setCashflow(cashflowRes.data || null);
        setPaymentSplit(payRes.data || null);
        setProfit(profitRes.data || null);
        setEbmSummary(ebmRes.data || null);
        setExpenseSummary(expRes.data || null);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load accountant data.");
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
    0;
  const cashNet =
    cashflow?.net ??
    cashflow?.totals?.net ??
    (Number(cashInflow || 0) - Number(cashOutflow || 0));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Accountant Dashboard</h2>
          <p className="muted">
            Financial summaries, cashflow, expenses, and compliance snapshots.
          </p>
        </div>
        <div className="button-row">
          <Link className="button-outline" to="/accounting/accounts">
            Chart of Accounts
          </Link>
          <Link className="button-outline" to="/accounting/journals">
            Journal Entries
          </Link>
          <Link className="button-outline" to="/accounting/trial-balance">
            Trial Balance
          </Link>
          <Link className="button-outline" to="/accounting/statements">
            Financial Statements
          </Link>
          <Link className="button-outline" to="/reports/expenses">
            Expenses
          </Link>
          <Link className="button-outline" to="/reports/sales">
            Sales Reports
          </Link>
          <Link className="button-outline" to="/reports/sales-sdc">
            SDC Sales
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
                <div className="stat-label">Tax</div>
                <div className="stat-value">{summary.sales?.taxTotal}</div>
              </div>
              <div>
                <div className="stat-label">Total</div>
                <div className="stat-value">{summary.sales?.total}</div>
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
                <div className="stat-label">Outflow</div>
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
          <h3>Profit</h3>
          {profit ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Revenue</div>
                <div className="stat-value">{profit.revenue}</div>
              </div>
              <div>
                <div className="stat-label">COGS</div>
                <div className="stat-value">{profit.cogsEstimated}</div>
              </div>
              <div>
                <div className="stat-label">Net Profit</div>
                <div className="stat-value">{profit.grossProfit}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No profit data.</div>
          )}
        </section>

        <section className="card">
          <h3>Expenses Snapshot</h3>
          {expenseSummary ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Count</div>
                <div className="stat-value">{expenseSummary.total?.count}</div>
              </div>
              <div>
                <div className="stat-label">Amount</div>
                <div className="stat-value">{expenseSummary.total?.amount}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No expense data.</div>
          )}
        </section>
      </div>

      <div className="split-view">
        <section className="card list-panel">
          <h3>Sales by Payment</h3>
          {paymentSplit?.byPayment?.length ? (
            <div className="table-compact">
              {paymentSplit.byPayment.map((row) => (
                <div key={row.paymentMethod} className="table-row">
                  <span>{row.paymentMethod}</span>
                  <span>{row.invoices} invoices</span>
                  <span>{row.total}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No payment split data.</div>
          )}
        </section>

        <section className="card preview-panel">
          <h3>EBM Summary</h3>
          {ebmSummary?.byStatus?.length ? (
            <div className="table-compact">
              {ebmSummary.byStatus.map((row) => (
                <div key={row.ebmStatus} className="table-row">
                  <span>{row.ebmStatus}</span>
                  <span>{row.invoices} invoices</span>
                  <span>{row.amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No EBM data.</div>
          )}
        </section>
      </div>
    </div>
  );
}
