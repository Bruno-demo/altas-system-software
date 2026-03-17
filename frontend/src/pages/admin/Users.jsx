import { useEffect, useState } from "react";
import {
  createUser,
  disableUser,
  enableUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from "../../api/admin";
import { useAuth } from "../../auth/AuthContext";

const roleOptions = [
  "STORE_KEEPER",
  "CASHIER",
  "SALESPERSON",
  "MANAGER",
  "ACCOUNTANT",
  "HR",
  "CEO",
];

const emptyForm = {
  fullName: "",
  email: "",
  role: "STORE_KEEPER",
  password: "",
  isActive: true,
};

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function Users() {
  const { user } = useAuth();
  const canWrite = ["CEO", "MANAGER"].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const totalPages = meta?.pages || 1;

  const loadUsers = async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = {
        page,
        limit,
        q: q.trim() || undefined,
        role: roleFilter || undefined,
      };
      if (statusFilter !== "all") {
        params.isActive = statusFilter === "true";
      }
      const res = await listUsers(params);
      setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setMeta(res.data?.meta || null);
      if (selected && !(res.data?.rows || []).some((row) => row.id === selected.id)) {
        setSelected(null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [page, limit]);

  useEffect(() => {
    if (!selected) {
      setForm(emptyForm);
      setResetPassword("");
      return;
    }
    setForm({
      fullName: selected.fullName || "",
      email: selected.email || "",
      role: selected.role || "STORE_KEEPER",
      password: "",
      isActive: selected.isActive !== false,
    });
    setResetPassword("");
  }, [selected]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    loadUsers();
  };

  const handleChange = (field) => (event) => {
    const { type, checked, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [field]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setSelected(null);
    setForm(emptyForm);
    setResetPassword("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canWrite) return;

    setMessage("");
    setSuccess("");

    if (!form.fullName.trim()) {
      setMessage("Full name is required.");
      return;
    }
    if (!form.email.trim()) {
      setMessage("Email is required.");
      return;
    }
    if (!form.role) {
      setMessage("Role is required.");
      return;
    }

    try {
      if (selected) {
        await updateUser(selected.id, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          role: form.role,
          isActive: form.isActive,
        });
        setSuccess("User updated.");
      } else {
        const payload = {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          role: form.role,
        };
        if (form.password.trim()) {
          payload.password = form.password.trim();
        }
        const res = await createUser(payload);
        const tempPassword = res.data?.tempPassword;
        setSuccess(
          tempPassword
            ? `User created. Temp password: ${tempPassword}`
            : "User created."
        );
      }
      resetForm();
      loadUsers();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Save failed.");
    }
  };

  const handleToggleActive = async () => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    setSuccess("");
    try {
      if (selected.isActive) {
        await disableUser(selected.id);
        setSuccess("User disabled.");
      } else {
        await enableUser(selected.id);
        setSuccess("User enabled.");
      }
      setSelected(null);
      loadUsers();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    setSuccess("");
    try {
      const payload = resetPassword.trim()
        ? { password: resetPassword.trim() }
        : undefined;
      const res = await resetUserPassword(selected.id, payload);
      const tempPassword = res.data?.tempPassword;
      setSuccess(
        tempPassword
          ? `Password reset. Temp password: ${tempPassword}`
          : "Password reset."
      );
      setResetPassword("");
      loadUsers();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Reset failed.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>System Users</h2>
          <p className="muted">Create accounts, update roles, and reset access.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadUsers}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="split-view">
        <section className="card list-panel">
          <form className="filters-grid" onSubmit={handleSearch}>
            <label className="field">
              Search
              <input
                placeholder="Name or email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className="field">
              Role
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
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

          <div className="table-toolbar">
            <div className="muted">{meta ? `Total: ${meta.total}` : "Users"}</div>
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
            <div className="data-row data-header user-row">
              <div>Name</div>
              <div>Email</div>
              <div>Role</div>
              <div>Status</div>
              <div>Last Login</div>
            </div>
            {loading ? (
              <div className="muted">Loading users...</div>
            ) : rows.length ? (
              rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`data-row data-button user-row ${
                    selected?.id === row.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <div>{row.fullName}</div>
                  <div>{row.email}</div>
                  <div>{row.role}</div>
                  <div>
                    <span
                      className={`badge ${row.isActive ? "" : "badge-warn"}`}
                    >
                      {row.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                  <div>{formatDateTime(row.lastLoginAt)}</div>
                </button>
              ))
            ) : (
              <div className="muted">No users found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <div className="table-toolbar">
            <h3>{selected ? "Edit User" : "Create User"}</h3>
            <button type="button" className="button-outline" onClick={resetForm}>
              New User
            </button>
          </div>

          {canWrite ? (
            <form className="form" onSubmit={submit}>
              <label className="field">
                Full name
                <input
                  value={form.fullName}
                  onChange={handleChange("fullName")}
                  required
                />
              </label>
              <label className="field">
                Email
                <input
                  value={form.email}
                  onChange={handleChange("email")}
                  required
                />
              </label>
              <label className="field">
                Role
                <select value={form.role} onChange={handleChange("role")}>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              {!selected ? (
                <label className="field">
                  Password (optional)
                  <input
                    type="password"
                    value={form.password}
                    onChange={handleChange("password")}
                  />
                </label>
              ) : null}
              {selected ? (
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={handleChange("isActive")}
                  />
                  <span>Account active</span>
                </label>
              ) : null}
              <div className="button-row">
                <button type="submit">{selected ? "Update User" : "Create User"}</button>
                <button type="button" className="button-outline" onClick={resetForm}>
                  Clear
                </button>
              </div>
            </form>
          ) : null}

          {selected ? (
            <>
              <div className="divider" />
              <div className="stack">
                <div className="stat-grid">
                  <div>
                    <div className="stat-label">Email</div>
                    <div className="stat-value">{selected.email}</div>
                  </div>
                  <div>
                    <div className="stat-label">Role</div>
                    <div className="stat-value">{selected.role}</div>
                  </div>
                  <div>
                    <div className="stat-label">Status</div>
                    <div className="stat-value">
                      {selected.isActive ? "ACTIVE" : "INACTIVE"}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Must Change Password</div>
                    <div className="stat-value">
                      {selected.mustChangePassword ? "YES" : "NO"}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Last Login</div>
                    <div className="stat-value">
                      {formatDateTime(selected.lastLoginAt)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Created</div>
                    <div className="stat-value">
                      {formatDateTime(selected.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="divider" />

                <div className="stack">
                  <h4>Password Reset</h4>
                  <label className="field">
                    New password (optional)
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button-outline"
                      onClick={handleToggleActive}
                      disabled={actionLoading}
                    >
                      {selected.isActive ? "Disable User" : "Enable User"}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Saving..." : "Reset Password"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="muted">Select a user to view details.</div>
          )}
        </section>
      </div>
    </div>
  );
}
