import { useEffect, useMemo, useState } from "react";
import {
  createEmployee,
  listEmployees,
  updateEmployee,
} from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";

const emptyForm = {
  employeeCode: "",
  fullName: "",
  nationalId: "",
  tin: "",
  phone: "",
  position: "",
  employmentType: "STAFF",
  hireDate: "",
  baseSalary: "",
  bankName: "",
  bankAccount: "",
  isActive: true,
};

function formatDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function money(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

export default function Employees() {
  const { user } = useAuth();
  const canWrite = ["HR", "CEO"].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPages = meta?.pages || 1;
  const activeCount = rows.filter((emp) => emp.isActive).length;
  const inactiveCount = rows.length - activeCount;
  const totalSalary = rows.reduce(
    (sum, emp) => sum + Number(emp.baseSalary || 0),
    0
  );

  const loadEmployees = async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = {
        page,
        limit,
        q: q.trim() || undefined,
      };
      if (activeFilter !== "all") {
        params.isActive = activeFilter === "true";
      }
      const res = await listEmployees(params);
      setRows(Array.isArray(res.data?.employees) ? res.data.employees : []);
      setMeta(res.data?.meta || null);
      if (
        selected &&
        !res.data?.employees?.some((emp) => emp.id === selected.id)
      ) {
        setSelected(null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [page, limit]);

  useEffect(() => {
    if (!selected) {
      setForm(emptyForm);
      return;
    }
    setForm({
      employeeCode: selected.employeeCode || "",
      fullName: selected.fullName || "",
      nationalId: selected.nationalId || "",
      tin: selected.tin || "",
      phone: selected.phone || "",
      position: selected.position || "",
      employmentType: selected.employmentType || "STAFF",
      hireDate: formatDateInput(selected.hireDate),
      baseSalary:
        selected.baseSalary != null ? String(selected.baseSalary) : "",
      bankName: selected.bankName || "",
      bankAccount: selected.bankAccount || "",
      isActive: selected.isActive !== false,
    });
  }, [selected]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    loadEmployees();
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
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canWrite) return;

    setMessage("");
    setSuccess("");

    if (!form.employeeCode.trim()) {
      setMessage("Employee code is required.");
      return;
    }
    if (!form.fullName.trim()) {
      setMessage("Full name is required.");
      return;
    }
    if (!form.baseSalary) {
      setMessage("Base salary is required.");
      return;
    }

    const payload = {
      employeeCode: form.employeeCode.trim(),
      fullName: form.fullName.trim(),
      nationalId: form.nationalId.trim() || null,
      tin: form.tin.trim() || null,
      phone: form.phone.trim() || null,
      position: form.position.trim() || null,
      employmentType: form.employmentType,
      hireDate: form.hireDate || null,
      baseSalary: form.baseSalary,
      bankName: form.bankName.trim() || null,
      bankAccount: form.bankAccount.trim() || null,
      isActive: form.isActive,
    };

    try {
      if (selected) {
        await updateEmployee(selected.id, payload);
        setSuccess("Employee updated.");
      } else {
        await createEmployee(payload);
        setSuccess("Employee created.");
      }
      resetForm();
      loadEmployees();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Save failed.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Employees</h2>
          <p className="muted">Manage employee profiles and salaries.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadEmployees}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="stat-grid">
        <div>
          <div className="stat-label">Active staff</div>
          <div className="stat-value">{activeCount}</div>
        </div>
        <div>
          <div className="stat-label">Inactive</div>
          <div className="stat-value">{inactiveCount}</div>
        </div>
        <div>
          <div className="stat-label">Total salary</div>
          <div className="stat-value">{money(totalSalary)}</div>
        </div>
      </div>

      <form className="filters-grid" onSubmit={handleSearch}>
        <label className="field">
          Search
          <input
            placeholder="Name, phone, badge ID, TIN..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="field">
          Status
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
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
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
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
              {meta ? `Total: ${meta.total}` : "Employees"}
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

          <div className="data-table hr-table">
            <div className="data-row data-header employee-row">
              <div>Badge</div>
              <div>Name</div>
              <div>Phone</div>
              <div data-col-min="220">Position</div>
              <div data-col-min="170">Status</div>
            </div>
            {loading ? (
              <div className="muted">Loading employees...</div>
            ) : rows.length ? (
              rows.map((emp) => (
                <button
                  type="button"
                  key={emp.id}
                  className={`data-row data-button employee-row ${
                    selected?.id === emp.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(emp)}
                >
                  <div>{emp.employeeCode}</div>
                  <div>{emp.fullName}</div>
                  <div>{emp.phone || "-"}</div>
                  <div>{emp.position || "-"}</div>
                  <div>
                    <span
                      className={`badge ${emp.isActive ? "" : "badge-warn"}`}
                    >
                      {emp.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="muted">No employees found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>{canWrite ? "Employee Form" : "Employee Preview"}</h3>
          {selected || canWrite ? (
            canWrite ? (
              <form className="form" onSubmit={submit}>
                <label className="field">
                  Badge/Code
                  <input
                    value={form.employeeCode}
                    onChange={handleChange("employeeCode")}
                    required
                  />
                </label>
                <label className="field">
                  Full name
                  <input
                    value={form.fullName}
                    onChange={handleChange("fullName")}
                    required
                  />
                </label>
                <label className="field">
                  Employment type
                  <select
                    value={form.employmentType}
                    onChange={handleChange("employmentType")}
                  >
                    <option value="STAFF">STAFF</option>
                    <option value="TRAINEE">TRAINEE</option>
                  </select>
                </label>
                <label className="field">
                  Hire date
                  <input
                    type="date"
                    value={form.hireDate}
                    onChange={handleChange("hireDate")}
                  />
                </label>
                <label className="field">
                  Base salary
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.baseSalary}
                    onChange={handleChange("baseSalary")}
                    required
                  />
                </label>
                <label className="field">
                  Position
                  <input
                    value={form.position}
                    onChange={handleChange("position")}
                  />
                </label>
                <label className="field">
                  Phone
                  <input
                    value={form.phone}
                    onChange={handleChange("phone")}
                  />
                </label>
                <label className="field">
                  National ID
                  <input
                    value={form.nationalId}
                    onChange={handleChange("nationalId")}
                  />
                </label>
                <label className="field">
                  TIN
                  <input
                    value={form.tin}
                    onChange={handleChange("tin")}
                  />
                </label>
                <label className="field">
                  Bank name
                  <input
                    value={form.bankName}
                    onChange={handleChange("bankName")}
                  />
                </label>
                <label className="field">
                  Bank account
                  <input
                    value={form.bankAccount}
                    onChange={handleChange("bankAccount")}
                  />
                </label>
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={handleChange("isActive")}
                  />
                  <span>Active employee</span>
                </label>
                <div className="button-row">
                  <button type="submit">
                    {selected ? "Update Employee" : "Create Employee"}
                  </button>
                  <button
                    type="button"
                    className="button-outline"
                    onClick={resetForm}
                  >
                    Clear
                  </button>
                </div>
              </form>
            ) : selected ? (
              <div className="stack">
                <div className="stat-grid">
                  <div>
                    <div className="stat-label">Badge</div>
                    <div className="stat-value">{selected.employeeCode}</div>
                  </div>
                  <div>
                    <div className="stat-label">Name</div>
                    <div className="stat-value">{selected.fullName}</div>
                  </div>
                  <div>
                    <div className="stat-label">Phone</div>
                    <div className="stat-value">{selected.phone || "-"}</div>
                  </div>
                  <div>
                    <div className="stat-label">TIN</div>
                    <div className="stat-value">{selected.tin || "-"}</div>
                  </div>
                  <div>
                    <div className="stat-label">Position</div>
                    <div className="stat-value">{selected.position || "-"}</div>
                  </div>
                  <div>
                    <div className="stat-label">Salary</div>
                    <div className="stat-value">
                      {selected.baseSalary || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Status</div>
                    <div className="stat-value">
                      {selected.isActive ? "ACTIVE" : "INACTIVE"}
                    </div>
                  </div>
                </div>
                <div className="muted">
                  Read-only access. Contact HR or CEO to edit.
                </div>
              </div>
            ) : (
              <div className="muted">Select an employee to preview.</div>
            )
          ) : (
            <div className="muted">
              {canWrite
                ? "Select an employee to edit."
                : "Select an employee to preview."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
