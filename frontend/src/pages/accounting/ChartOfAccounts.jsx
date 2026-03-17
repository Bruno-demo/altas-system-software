import { useEffect, useState } from "react";
import Drawer from "../../components/Drawer";
import {
  createAccount,
  listAccounts,
  seedDefaultAccounts,
  updateAccount,
} from "../../api/accounting";

const accountTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

function emptyForm() {
  return {
    code: "",
    name: "",
    type: "ASSET",
    category: "",
    isCash: false,
    isActive: true,
  };
}

export default function ChartOfAccounts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const loadAccounts = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listAccounts({
        type: typeFilter || undefined,
        q: query.trim() || undefined,
      });
      setRows(res.data || []);
      if (selected) {
        const fresh = (res.data || []).find((row) => row.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [typeFilter]);

  const applyFilters = (event) => {
    event.preventDefault();
    loadAccounts();
  };

  const openCreate = () => {
    setDrawerMode("create");
    setEditingId(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setDrawerMode("edit");
    setEditingId(selected.id);
    setForm({
      code: selected.code || "",
      name: selected.name || "",
      type: selected.type || "ASSET",
      category: selected.category || "",
      isCash: Boolean(selected.isCash),
      isActive: selected.isActive !== false,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setMessage("");
    setSuccess("");

    if (!form.code.trim()) {
      setMessage("Account code is required.");
      return;
    }
    if (!form.name.trim()) {
      setMessage("Account name is required.");
      return;
    }

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      category: form.category.trim() || null,
      isCash: Boolean(form.isCash),
      isActive: Boolean(form.isActive),
    };

    try {
      if (drawerMode === "edit" && editingId) {
        await updateAccount(editingId, payload);
        setSuccess("Account updated.");
      } else {
        await createAccount(payload);
        setSuccess("Account created.");
      }
      setDrawerOpen(false);
      setForm(emptyForm());
      setEditingId(null);
      setDrawerMode("create");
      loadAccounts();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to save account.");
    }
  };

  const handleSeed = async () => {
    setMessage("");
    setSuccess("");
    try {
      await seedDefaultAccounts();
      setSuccess("Default chart of accounts created.");
      loadAccounts();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to seed chart of accounts.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Chart of Accounts</h2>
          <p className="muted">Maintain your account structure for accurate reporting.</p>
        </div>
        <div className="button-row">
          {rows.length === 0 ? (
            <button type="button" className="button-outline" onClick={handleSeed}>
              Seed Default Chart
            </button>
          ) : null}
          <button type="button" onClick={openCreate}>
            New Account
          </button>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <form className="filters-grid" onSubmit={applyFilters}>
        <label className="field">
          Type
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All</option>
            {accountTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Search
          <input
            placeholder="Code, name, category"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
            <div className="muted">Total: {rows.length}</div>
          </div>
          <div className="data-table">
            <div className="data-row data-header account-row">
              <div>Code</div>
              <div>Name</div>
              <div>Type</div>
              <div>Category</div>
              <div>Cash</div>
              <div>Status</div>
            </div>
            {loading ? (
              <div className="muted">Loading accounts...</div>
            ) : rows.length ? (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`data-row account-row data-button ${row.id === selected?.id ? "data-selected" : ""}`}
                  onClick={() => setSelected(row)}
                >
                  <div>{row.code}</div>
                  <div>{row.name}</div>
                  <div>{row.type}</div>
                  <div>{row.category || "-"}</div>
                  <div>{row.isCash ? "Yes" : "No"}</div>
                  <div>{row.isActive ? "Active" : "Inactive"}</div>
                </button>
              ))
            ) : (
              <div className="muted">No accounts found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Account Preview</h3>
          {selected ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Code</div>
                  <div className="stat-value">{selected.code}</div>
                </div>
                <div>
                  <div className="stat-label">Name</div>
                  <div className="stat-value">{selected.name}</div>
                </div>
                <div>
                  <div className="stat-label">Type</div>
                  <div className="stat-value">{selected.type}</div>
                </div>
                <div>
                  <div className="stat-label">Category</div>
                  <div className="stat-value">{selected.category || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Cash Account</div>
                  <div className="stat-value">{selected.isCash ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="stat-label">Status</div>
                  <div className="stat-value">{selected.isActive ? "Active" : "Inactive"}</div>
                </div>
              </div>
              <div className="button-row">
                <button type="button" className="button-outline" onClick={openEdit}>
                  Edit Account
                </button>
              </div>
            </div>
          ) : (
            <div className="muted">Select an account to preview.</div>
          )}
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === "edit" ? "Edit Account" : "Create Account"}
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
            Code
            <input
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            />
          </label>
          <label className="field">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </label>
          <label className="field">
            Type
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
            >
              {accountTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Category
            <input
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isCash}
              onChange={(e) => setForm((prev) => ({ ...prev, isCash: e.target.checked }))}
            />
            <span>Cash account (used for cash flow)</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            <span>Active</span>
          </label>
        </div>
      </Drawer>
    </div>
  );
}
