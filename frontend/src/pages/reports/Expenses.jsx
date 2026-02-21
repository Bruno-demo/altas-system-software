import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import Drawer from "../../components/Drawer";
import {
  createExpense,
  exportExpensesExcel,
  getExpensesSummary,
  listExpenses,
  softDeleteExpense,
  updateExpense,
} from "../../api/expenses";
import { downloadBlob, getFilenameFromDisposition } from "../../utils/download";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom range" },
];

const categories = [
  "RENT",
  "UTILITIES",
  "TRANSPORT",
  "SALARY_PAYOUT",
  "STOCK_PURCHASE",
  "MAINTENANCE",
  "TAX",
  "OFFICE",
  "OTHER",
];

const paymentMethods = ["CASH", "MOMO", "CARD", "BANK", "OTHER"];

function money(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildRangeParams(filters) {
  if (filters.period === "custom") {
    return {
      from: filters.from,
      to: filters.to,
    };
  }
  return { period: filters.period };
}

function emptyFormState() {
  return {
    date: toDateInput(new Date()),
    amount: "",
    category: "OTHER",
    paymentMethod: "CASH",
    vendor: "",
    referenceNo: "",
    description: "",
  };
}

export default function Expenses() {
  const { user } = useAuth();
  const canWrite = ["CEO", "MANAGER"].includes(user?.role);

  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qInput, setQInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [limit, setLimit] = useState(50);

  const [appliedFilters, setAppliedFilters] = useState({
    period: "this_month",
    from: "",
    to: "",
    q: "",
    category: "",
    paymentMethod: "",
  });
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1, limit: 50 });
  const [totals, setTotals] = useState({ count: 0, amount: 0 });
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyFormState());

  const rangeParams = useMemo(() => buildRangeParams(appliedFilters), [appliedFilters]);

  const loadData = async () => {
    setLoading(true);
    setMessage("");
    try {
      const listParams = {
        ...rangeParams,
        page,
        limit,
        q: appliedFilters.q || undefined,
        category: appliedFilters.category || undefined,
        paymentMethod: appliedFilters.paymentMethod || undefined,
      };

      const summaryParams = {
        ...rangeParams,
        category: appliedFilters.category || undefined,
        paymentMethod: appliedFilters.paymentMethod || undefined,
      };

      const [listRes, summaryRes] = await Promise.all([
        listExpenses(listParams),
        getExpensesSummary(summaryParams),
      ]);

      const nextRows = listRes.data?.rows || [];
      const nextMeta = listRes.data?.meta || { total: 0, page: 1, pages: 1, limit };
      const nextTotals = listRes.data?.totals || { count: nextMeta.total || 0, amount: 0 };

      setRows(nextRows);
      setMeta(nextMeta);
      setTotals(nextTotals);
      setSummary(summaryRes.data || null);

      if (selected) {
        const fresh = nextRows.find((row) => row.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, limit, appliedFilters]);

  const applyFilters = (event) => {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (period === "custom" && (!from || !to)) {
      setMessage("Select both From and To dates.");
      return;
    }

    setPage(1);
    setAppliedFilters({
      period,
      from,
      to,
      q: qInput.trim(),
      category: categoryFilter,
      paymentMethod: paymentFilter,
    });
  };

  const openCreate = () => {
    setDrawerMode("create");
    setEditingId(null);
    setForm(emptyFormState());
    setDrawerOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setDrawerMode("edit");
    setEditingId(selected.id);
    setForm({
      date: toDateInput(selected.date),
      amount: String(selected.amount || ""),
      category: selected.category || "OTHER",
      paymentMethod: selected.paymentMethod || "CASH",
      vendor: selected.vendor || "",
      referenceNo: selected.referenceNo || "",
      description: selected.description || "",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setMessage("");
    setSuccess("");

    if (!form.date) {
      setMessage("Date is required.");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setMessage("Amount must be greater than zero.");
      return;
    }

    const payload = {
      date: form.date,
      amount: Number(form.amount),
      category: form.category,
      paymentMethod: form.paymentMethod,
      vendor: form.vendor.trim() || undefined,
      referenceNo: form.referenceNo.trim() || undefined,
      description: form.description.trim() || undefined,
    };

    try {
      if (drawerMode === "edit" && editingId) {
        await updateExpense(editingId, payload);
        setSuccess("Expense updated.");
      } else {
        await createExpense(payload);
        setSuccess("Expense created.");
      }
      setDrawerOpen(false);
      setForm(emptyFormState());
      setEditingId(null);
      setDrawerMode("create");
      loadData();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to save expense.");
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm("Delete selected expense?")) return;
    setMessage("");
    setSuccess("");
    try {
      await softDeleteExpense(selected.id);
      setSuccess("Expense deleted.");
      setSelected(null);
      loadData();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to delete expense.");
    }
  };

  const handleExport = async () => {
    setMessage("");
    try {
      const res = await exportExpensesExcel({
        ...rangeParams,
        category: appliedFilters.category || undefined,
        paymentMethod: appliedFilters.paymentMethod || undefined,
      });
      const filename = getFilenameFromDisposition(
        res.headers?.["content-disposition"],
        "expenses.xlsx"
      );
      downloadBlob(res.data, filename);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to export expenses.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Expenses</h2>
          <p className="muted">Track outflows and keep cashflow accurate.</p>
        </div>
        <div className="button-row">
          <button type="button" className="button-outline" onClick={handleExport}>
            Download Expenses Excel
          </button>
          {canWrite ? (
            <button type="button" onClick={openCreate}>
              New Expense
            </button>
          ) : null}
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

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
          Search
          <input
            placeholder="Vendor, description, ref no..."
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </label>
        <label className="field">
          Category
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Payment
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
            <option value="">All</option>
            {paymentMethods.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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

      <div className="cards-grid">
        <section className="card">
          <h3>Expense Snapshot</h3>
          <div className="stat-grid">
            <div>
              <div className="stat-label">Rows</div>
              <div className="stat-value">{totals.count || 0}</div>
            </div>
            <div>
              <div className="stat-label">Amount</div>
              <div className="stat-value">{money(totals.amount)}</div>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>By Category</h3>
          {summary?.byCategory?.length ? (
            <div className="table-compact">
              {summary.byCategory.map((row) => (
                <div key={row.category} className="table-row">
                  <span>{row.category}</span>
                  <span>{row.count} rows</span>
                  <span>{money(row.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No category totals.</div>
          )}
        </section>

        <section className="card">
          <h3>By Payment</h3>
          {summary?.byPaymentMethod?.length ? (
            <div className="table-compact">
              {summary.byPaymentMethod.map((row) => (
                <div key={row.paymentMethod} className="table-row">
                  <span>{row.paymentMethod}</span>
                  <span>{row.count} rows</span>
                  <span>{money(row.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No payment totals.</div>
          )}
        </section>
      </div>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">Total: {meta?.total || 0}</div>
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
                Page {meta?.page || page} / {meta?.pages || 1}
              </div>
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.min(prev + 1, meta?.pages || 1))}
                disabled={page >= (meta?.pages || 1) || loading}
              >
                Next
              </button>
            </div>
          </div>

          <div className="data-table">
            <div className="data-row data-header">
              <div>Date</div>
              <div>Category</div>
              <div>Payment</div>
              <div>Amount</div>
              <div>Vendor</div>
              <div>Reference</div>
            </div>
            {loading ? (
              <div className="muted">Loading expenses...</div>
            ) : rows.length ? (
              rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`data-row data-button ${row.id === selected?.id ? "data-selected" : ""}`}
                  onClick={() => setSelected(row)}
                >
                  <div>{toDateInput(row.date) || "-"}</div>
                  <div>{row.category || "-"}</div>
                  <div>{row.paymentMethod || "-"}</div>
                  <div>{money(row.amount)}</div>
                  <div>{row.vendor || "-"}</div>
                  <div>{row.referenceNo || "-"}</div>
                </button>
              ))
            ) : (
              <div className="muted">No expenses found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Expense Preview</h3>
          {selected ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Date</div>
                  <div className="stat-value">{toDateInput(selected.date) || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Amount</div>
                  <div className="stat-value">{money(selected.amount)}</div>
                </div>
                <div>
                  <div className="stat-label">Category</div>
                  <div className="stat-value">{selected.category || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Payment</div>
                  <div className="stat-value">{selected.paymentMethod || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Vendor</div>
                  <div className="stat-value">{selected.vendor || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Reference</div>
                  <div className="stat-value">{selected.referenceNo || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Description</div>
                  <div className="stat-value">{selected.description || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Created By</div>
                  <div className="stat-value">{selected.createdBy?.fullName || "-"}</div>
                </div>
              </div>
              {canWrite ? (
                <div className="button-row">
                  <button type="button" className="button-outline" onClick={openEdit}>
                    Edit Expense
                  </button>
                  <button type="button" className="button-outline" onClick={handleDelete}>
                    Delete Expense
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="muted">Select an expense to preview.</div>
          )}
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === "edit" ? "Edit Expense" : "Create Expense"}
        footer={
          <div className="button-row">
            <button type="button" className="button-outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={handleSave}>
              {drawerMode === "edit" ? "Save Changes" : "Create"}
            </button>
          </div>
        }
      >
        <div className="form form-wide">
          <label className="field">
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
            />
          </label>
          <label className="field">
            Amount
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
            />
          </label>
          <label className="field">
            Category
            <select
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Payment method
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
            >
              {paymentMethods.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Vendor
            <input
              value={form.vendor}
              onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
            />
          </label>
          <label className="field">
            Reference number
            <input
              value={form.referenceNo}
              onChange={(e) => setForm((prev) => ({ ...prev, referenceNo: e.target.value }))}
            />
          </label>
          <label className="field">
            Description
            <input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </label>
        </div>
      </Drawer>
    </div>
  );
}
