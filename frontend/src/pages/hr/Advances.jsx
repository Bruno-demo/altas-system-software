import { useEffect, useState } from "react";
import {
  advancesSummary,
  cancelAdvance,
  createAdvance,
  listAdvances,
  listEmployees,
} from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";
import Modal from "../../components/Modal";

function money(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

export default function Advances() {
  const { user } = useAuth();
  const canWrite = ["HR", "CEO"].includes(user?.role);

  const [employees, setEmployees] = useState([]);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    employeeId: "",
    amount: "",
    date: "",
    reason: "",
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEmployeeIds, setBulkEmployeeIds] = useState([]);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [statusFilter, setStatusFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const [summaryFrom, setSummaryFrom] = useState("");
  const [summaryTo, setSummaryTo] = useState("");
  const [summaryData, setSummaryData] = useState(null);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  const totalPages = meta?.pages || 1;
  const activeEmployees = employees.filter((emp) => emp.isActive);

  const loadEmployees = async () => {
    try {
      const res = await listEmployees({ page: 1, limit: 200 });
      setEmployees(res.data?.employees || []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load employees.");
    }
  };

  const loadAdvances = async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = {
        page,
        limit,
        status: statusFilter || undefined,
        employeeId: employeeFilter || undefined,
      };
      if (from && to) {
        params.from = from;
        params.to = to;
      }
      const res = await listAdvances(params);
      setRows(Array.isArray(res.data?.advances) ? res.data.advances : []);
      setMeta(res.data?.meta || null);
      if (
        selected &&
        !res.data?.advances?.some((adv) => adv.id === selected.id)
      ) {
        setSelected(null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load advances.");
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async (event) => {
    event.preventDefault();
    setSummaryMessage("");

    if (!summaryFrom || !summaryTo) {
      setSummaryMessage("From and To dates are required.");
      return;
    }
    setSummaryLoading(true);
    try {
      const res = await advancesSummary({
        from: summaryFrom,
        to: summaryTo,
      });
      setSummaryData(res.data || null);
    } catch (err) {
      setSummaryMessage(err?.response?.data?.message || "Failed to load summary.");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadAdvances();
  }, [page, limit]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    loadAdvances();
  };

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleBulkToggle = (event) => {
    const checked = event.target.checked;
    setBulkMode(checked);
    setBulkEmployeeIds([]);
    setForm((prev) => ({ ...prev, employeeId: "" }));
  };

  const handleBulkSelect = (event) => {
    const ids = Array.from(event.target.selectedOptions).map(
      (opt) => opt.value
    );
    setBulkEmployeeIds(ids);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canWrite) return;

    setMessage("");
    setSuccess("");

    if (bulkMode && bulkEmployeeIds.length === 0) {
      setMessage("Select at least one employee.");
      return;
    }
    if (!bulkMode && !form.employeeId) {
      setMessage("Employee is required.");
      return;
    }
    if (!form.amount) {
      setMessage("Amount is required.");
      return;
    }

    try {
      const payload = {
        amount: form.amount,
        date: form.date || undefined,
        reason: form.reason.trim() || undefined,
      };
      if (bulkMode) {
        payload.employeeIds = bulkEmployeeIds;
      } else {
        payload.employeeId = form.employeeId;
      }
      await createAdvance(payload);
      setSuccess(
        bulkMode
          ? `Advance created for ${bulkEmployeeIds.length} employees.`
          : "Advance created."
      );
      setForm({ employeeId: "", amount: "", date: "", reason: "" });
      setBulkEmployeeIds([]);
      setBulkMode(false);
      loadAdvances();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Create failed.");
    }
  };

  const openCancel = () => {
    setCancelReason("");
    setShowCancel(true);
  };

  const confirmCancel = async () => {
    if (!selected) return;
    setCancelLoading(true);
    try {
      await cancelAdvance(selected.id, {
        reason: cancelReason.trim() || undefined,
      });
      setShowCancel(false);
      setSuccess("Advance cancelled.");
      setCancelReason("");
      setSelected(null);
      loadAdvances();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Cancel failed.");
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Salary Advances</h2>
          <p className="muted">Create, view, and cancel advances.</p>
        </div>
        <button type="button" className="button-outline" onClick={loadAdvances}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="split-view">
        <section className="card list-panel">
          <form className="filters-grid" onSubmit={handleSearch}>
            <label className="field">
              Employee
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
              >
                <option value="">All</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
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
                <option value="">All</option>
                <option value="APPROVED">APPROVED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </label>
            <label className="field">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
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
            <div className="muted">
              {meta ? `Total: ${meta.total}` : "Advances"}
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
            <div className="data-row data-header advance-row">
              <div>Date</div>
              <div>Employee</div>
              <div>Amount</div>
              <div>Status</div>
              <div>Created By</div>
            </div>
            {loading ? (
              <div className="muted">Loading advances...</div>
            ) : rows.length ? (
              rows.map((adv) => (
                <button
                  type="button"
                  key={adv.id}
                  className={`data-row data-button advance-row ${
                    selected?.id === adv.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(adv)}
                >
                  <div>{new Date(adv.date).toLocaleDateString()}</div>
                  <div>{adv.employee?.fullName || "-"}</div>
                  <div>{money(adv.amount)}</div>
                  <div>
                    <span
                      className={`badge ${
                        adv.status === "APPROVED" ? "" : "badge-warn"
                      }`}
                    >
                      {adv.status}
                    </span>
                  </div>
                  <div>{adv.createdBy?.fullName || "-"}</div>
                </button>
              ))
            ) : (
              <div className="muted">No advances found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>{canWrite ? "Create Advance" : "Advance Preview"}</h3>
          {canWrite ? (
            <form className="form" onSubmit={submit}>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={bulkMode}
                  onChange={handleBulkToggle}
                />
                <span>Create for multiple employees</span>
              </label>
              {bulkMode ? (
                <label className="field">
                  Employees
                  <select
                    multiple
                    size={6}
                    value={bulkEmployeeIds}
                    onChange={handleBulkSelect}
                  >
                    {activeEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </option>
                    ))}
                  </select>
                  <div className="muted">Amount applies to all selected employees.</div>
                </label>
              ) : (
                <label className="field">
                  Employee
                  <select
                    value={form.employeeId}
                    onChange={handleFormChange("employeeId")}
                    required
                  >
                    <option value="">Select employee</option>
                    {activeEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                Amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={handleFormChange("amount")}
                  required
                />
              </label>
              <label className="field">
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={handleFormChange("date")}
                />
              </label>
              <label className="field">
                Reason
                <input
                  value={form.reason}
                  onChange={handleFormChange("reason")}
                />
              </label>
              <button type="submit">Create Advance</button>
            </form>
          ) : null}

          {selected ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Employee</div>
                  <div className="stat-value">
                    {selected.employee?.fullName || "-"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Amount</div>
                  <div className="stat-value">{money(selected.amount)}</div>
                </div>
                <div>
                  <div className="stat-label">Date</div>
                  <div className="stat-value">
                    {new Date(selected.date).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Status</div>
                  <div className="stat-value">{selected.status}</div>
                </div>
                <div>
                  <div className="stat-label">Created By</div>
                  <div className="stat-value">
                    {selected.createdBy?.fullName || "-"}
                  </div>
                </div>
              </div>
              <div>
                <div className="stat-label">Reason</div>
                <div className="muted-block">{selected.reason || "-"}</div>
              </div>
              {canWrite && selected.status === "APPROVED" ? (
                <button
                  type="button"
                  className="button-outline"
                  onClick={openCancel}
                >
                  Cancel Advance
                </button>
              ) : null}
            </div>
          ) : (
            <div className="muted">Select an advance to preview.</div>
          )}

          <div className="divider" />

          <div className="stack">
            <h4>Advances Summary</h4>
            {summaryMessage ? <div className="alert">{summaryMessage}</div> : null}
            <form className="filters-grid" onSubmit={loadSummary}>
              <label className="field">
                From
                <input
                  type="date"
                  value={summaryFrom}
                  onChange={(e) => setSummaryFrom(e.target.value)}
                />
              </label>
              <label className="field">
                To
                <input
                  type="date"
                  value={summaryTo}
                  onChange={(e) => setSummaryTo(e.target.value)}
                />
              </label>
              <div className="filter-actions">
                <button type="submit" disabled={summaryLoading}>
                  {summaryLoading ? "Loading..." : "Load Summary"}
                </button>
              </div>
            </form>
            {summaryData ? (
              <div className="stack">
                <div className="stat-grid">
                  <div>
                    <div className="stat-label">Approved count</div>
                    <div className="stat-value">
                      {summaryData.totals?.approved?.count || 0}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Approved amount</div>
                    <div className="stat-value">
                      {money(summaryData.totals?.approved?.amount || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Cancelled count</div>
                    <div className="stat-value">
                      {summaryData.totals?.cancelled?.count || 0}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Cancelled amount</div>
                    <div className="stat-value">
                      {money(summaryData.totals?.cancelled?.amount || 0)}
                    </div>
                  </div>
                </div>
                <div className="data-table hr-table">
                  <div className="data-row data-header summary-row">
                    <div>Employee</div>
                    <div>Count</div>
                    <div>Amount</div>
                  </div>
                  {summaryData.perEmployee?.length ? (
                    summaryData.perEmployee.map((row) => (
                      <div key={row.employee.id} className="data-row summary-row">
                        <div>{row.employee.fullName || row.employee.id}</div>
                        <div>{row.count}</div>
                        <div>{money(row.amount)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="muted">No summary records.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="muted">Select dates to see summary.</div>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={showCancel}
        title="Cancel Advance"
        onClose={() => setShowCancel(false)}
        footer={
          <div className="button-row">
            <button
              type="button"
              className="button-outline"
              onClick={() => setShowCancel(false)}
            >
              Close
            </button>
            <button type="button" onClick={confirmCancel} disabled={cancelLoading}>
              {cancelLoading ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        }
      >
        <div className="form">
          <label className="field">
            Reason (optional)
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
