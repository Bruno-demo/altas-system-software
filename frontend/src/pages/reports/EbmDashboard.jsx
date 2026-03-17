// What this does: EBM summary + pending invoices with actions
import { useEffect, useState } from "react";
import {
  getEbmPending,
  getEbmPendingByCashier,
  getEbmSummary,
  markEbmFailed,
  markEbmPending,
} from "../../api/reports";
import { useAuth } from "../../auth/AuthContext";
import Modal from "../../components/Modal";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function money(n) {
  const value = Number(n || 0);
  if (Number.isNaN(value)) return "0.00";
  return value.toFixed(2);
}

export default function EbmDashboard() {
  const { user } = useAuth();
  const canUpdateStatus = ["MANAGER", "CEO"].includes(
    String(user?.role || "").toUpperCase()
  );
  const [period, setPeriod] = useState("this_week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(50);
  const [invoiceLimit, setInvoiceLimit] = useState(10);
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState([]);
  const [pendingMeta, setPendingMeta] = useState(null);
  const [byCashier, setByCashier] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [actionType, setActionType] = useState("FAILED");
  const [actionSale, setActionSale] = useState(null);
  const [reason, setReason] = useState("");

  const [manualSaleId, setManualSaleId] = useState("");
  const [manualReason, setManualReason] = useState("");

  const totalPages = pendingMeta?.pages || 1;

  const buildParams = () => {
    if (period === "custom") {
      return { from, to };
    }
    return { period };
  };

  const loadAll = async () => {
    setLoading(true);
    setMessage("");
    const params = buildParams();
    if (period === "custom" && (!from || !to)) {
      setMessage("Select both From and To dates.");
      setLoading(false);
      return;
    }
    try {
      const [summaryRes, pendingRes, byCashierRes] = await Promise.all([
        getEbmSummary(params),
        getEbmPending({ ...params, page, limit }),
        getEbmPendingByCashier({ ...params, invoiceLimit }),
      ]);
      setSummary(summaryRes.data || null);
      setPending(pendingRes.data?.pending || []);
      setPendingMeta(pendingRes.data?.meta || null);
      setByCashier(byCashierRes.data?.byCashier || []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load EBM data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [page, limit, invoiceLimit]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    loadAll();
  };

  const openAction = (sale, type) => {
    setActionSale(sale);
    setActionType(type);
    setReason("");
    setModalOpen(true);
  };

  const submitAction = async () => {
    if (!actionSale) return;
    setMessage("");
    if (actionType === "FAILED" && !reason.trim()) {
      setMessage("Reason is required to mark FAILED.");
      return;
    }
    try {
      if (actionType === "FAILED") {
        await markEbmFailed(actionSale.id, { reason: reason.trim() });
      } else {
        await markEbmPending(actionSale.id, {
          reason: reason.trim() || undefined,
        });
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to update EBM status.");
    }
  };

  const manualReopen = async () => {
    if (!manualSaleId.trim()) {
      setMessage("Sale ID is required.");
      return;
    }
    setMessage("");
    try {
      await markEbmPending(manualSaleId.trim(), {
        reason: manualReason.trim() || undefined,
      });
      setManualSaleId("");
      setManualReason("");
      await loadAll();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to reopen EBM.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>EBM Dashboard</h2>
          <p className="muted">Track pending EBM invoices and status updates.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadAll}>
          Refresh
        </button>
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
        <label className="field">
          Pending limit
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
        <label className="field">
          Cashier list limit
          <select
            value={invoiceLimit}
            onChange={(e) => {
              setInvoiceLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </label>
        <div className="filter-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Apply Filters"}
          </button>
        </div>
      </form>

      <div className="cards-grid">
        <section className="card">
          <h3>EBM Summary</h3>
          {summary ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Invoices</div>
                <div className="stat-value">{summary.totals?.invoices}</div>
              </div>
              <div>
                <div className="stat-label">Amount</div>
                <div className="stat-value">{money(summary.totals?.amount)}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No summary data.</div>
          )}
          {summary?.byStatus?.length ? (
            <div className="table-compact">
              {summary.byStatus.map((row) => (
                <div key={row.ebmStatus} className="table-row">
                  <span>{row.ebmStatus}</span>
                  <span>{row.invoices} invoices</span>
                  <span>{money(row.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {canUpdateStatus ? (
          <section className="card">
            <h3>Reopen Failed Invoice</h3>
            <div className="form">
              <div className="field">
                <label>Sale ID</label>
                <input
                  value={manualSaleId}
                  onChange={(e) => setManualSaleId(e.target.value)}
                  placeholder="Sale ID"
                />
              </div>
              <div className="field">
                <label>Reason (optional)</label>
                <input
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Optional reason"
                />
              </div>
              <button type="button" onClick={manualReopen}>
                Mark Pending
              </button>
            </div>
          </section>
        ) : (
          <section className="card">
            <h3>Status Actions</h3>
            <div className="muted">
              Status changes are restricted to Manager and CEO.
            </div>
          </section>
        )}
      </div>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">
              {pendingMeta ? `Total pending: ${pendingMeta.total}` : "Pending"}
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
            <div className="data-row data-header ebm-row">
              <div>Invoice</div>
              <div>Date</div>
              <div>Cashier</div>
              <div>Buyer</div>
              <div>Total</div>
              <div>Actions</div>
            </div>
            {loading ? (
              <div className="muted">Loading pending invoices...</div>
            ) : pending.length ? (
              pending.map((row) => (
                <div key={row.id} className="data-row ebm-row">
                  <div>{row.invoiceNo}</div>
                  <div>{new Date(row.createdAt).toLocaleString()}</div>
                  <div>{row.cashier?.fullName}</div>
                  <div>{row.buyerName || row.buyerTin || "-"}</div>
                  <div>{money(row.total)}</div>
                  <div className="button-row">
                    {canUpdateStatus ? (
                      <button
                        type="button"
                        className="button-outline"
                        onClick={() => openAction(row, "FAILED")}
                      >
                        Mark Failed
                      </button>
                    ) : (
                      <span className="muted">View only</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">No pending invoices.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Pending by Cashier</h3>
          {byCashier.length ? (
            <div className="stack">
              {byCashier.map((row) => (
                <div key={row.cashier?.id} className="muted-block">
                  <div className="stat-grid">
                    <div>
                      <div className="stat-label">Cashier</div>
                      <div className="stat-value">{row.cashier?.fullName}</div>
                    </div>
                    <div>
                      <div className="stat-label">Invoices</div>
                      <div className="stat-value">{row.invoices}</div>
                    </div>
                    <div>
                      <div className="stat-label">Amount</div>
                      <div className="stat-value">{money(row.amount)}</div>
                    </div>
                  </div>
                  <div className="data-table ebm-cashier-table">
                    <div className="data-row data-header ebm-cashier-row">
                      <div>Invoice</div>
                      <div>Amount</div>
                      <div>Buyer</div>
                    </div>
                    {row.latestInvoices?.length ? (
                      row.latestInvoices.map((inv) => (
                        <div key={inv.id} className="data-row ebm-cashier-row">
                          <div>{inv.invoiceNo}</div>
                          <div>{money(inv.total)}</div>
                          <div>{inv.buyerName || inv.buyerTin || "-"}</div>
                        </div>
                      ))
                    ) : (
                      <div className="muted">No pending invoices.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No pending invoices by cashier.</div>
          )}
        </section>
      </div>

      {canUpdateStatus ? (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={actionType === "FAILED" ? "Mark EBM Failed" : "Mark EBM Pending"}
          footer={
            <div className="button-row">
              <button
                type="button"
                className="button-outline"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button type="button" onClick={submitAction}>
                Confirm
              </button>
            </div>
          }
        >
          <div className="form">
            <div className="field">
              <label>Invoice</label>
              <input value={actionSale?.invoiceNo || ""} disabled />
            </div>
            <div className="field">
              <label>Reason {actionType === "FAILED" ? "(required)" : "(optional)"}</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason"
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
