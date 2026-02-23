import { useEffect, useMemo, useState } from "react";
import {
  exportPayrollBankExcel,
  finalizePayroll,
  generatePayroll,
  getPayrollRun,
  listPayrollRuns,
  listEmployees,
} from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";
import { downloadBlob, getFilenameFromDisposition } from "../../utils/download";

function money(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

export default function Payroll() {
  const { user } = useAuth();
  const canWrite = ["HR", "CEO"].includes(user?.role);

  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [runId, setRunId] = useState("");
  const [runs, setRuns] = useState([]);
  const [runSearch, setRunSearch] = useState("");
  const [runStatusFilter, setRunStatusFilter] = useState("");
  const [runLoading, setRunLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [itemLimit, setItemLimit] = useState(20);

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [restrictEmployees, setRestrictEmployees] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);

  const [run, setRun] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedMeta, setGeneratedMeta] = useState(null);

  const loadRun = async (targetId) => {
    const id = targetId || runId.trim();
    if (!id) {
      setMessage("Payroll run ID is required.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await getPayrollRun(id);
      const runData = res.data || null;
      setRun(runData);
      if (runData) {
        setGeneratedMeta({
          employees: runData.items?.length || 0,
          workingDays: runData.items?.[0]?.workingDays || 0,
          runId: runData.id,
        });
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load payroll.");
      setRun(null);
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async (query) => {
    setRunLoading(true);
    try {
      const res = await listPayrollRuns({
        q: query?.trim() || undefined,
        status: runStatusFilter || undefined,
        limit: 50,
      });
      setRuns(res.data?.runs || []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load payroll runs.");
    } finally {
      setRunLoading(false);
    }
  };

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const res = await listEmployees({ page: 1, limit: 100, isActive: true });
      setEmployees(res.data?.employees || []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load employees.");
    } finally {
      setEmployeesLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    loadRuns("");
  }, []);

  useEffect(() => {
    if (run?.items?.length) {
      setSelectedItem(run.items[0]);
    } else {
      setSelectedItem(null);
    }
    setItemPage(1);
  }, [run]);

  const payrollItems = run?.items || [];
  const itemPages = Math.max(Math.ceil(payrollItems.length / itemLimit), 1);
  const pagedPayrollItems = useMemo(() => {
    const start = (itemPage - 1) * itemLimit;
    return payrollItems.slice(start, start + itemLimit);
  }, [payrollItems, itemPage, itemLimit]);

  useEffect(() => {
    if (itemPage > itemPages) setItemPage(itemPages);
  }, [itemPage, itemPages]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleRestrictToggle = (event) => {
    const checked = event.target.checked;
    setRestrictEmployees(checked);
    setSelectedEmployeeIds([]);
  };

  const handleEmployeeSelect = (event) => {
    const ids = Array.from(event.target.selectedOptions).map(
      (opt) => opt.value
    );
    setSelectedEmployeeIds(ids);
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (!canWrite) return;

    setMessage("");
    setSuccess("");

    if (!year || !month) {
      setMessage("Year and month are required.");
      return;
    }
    if (restrictEmployees && selectedEmployeeIds.length === 0) {
      setMessage("Select at least one employee.");
      return;
    }

    setLoading(true);
    try {
      const res = await generatePayroll({
        year: Number(year),
        month: Number(month),
        employeeIds: restrictEmployees ? selectedEmployeeIds : undefined,
      });
      const newRunId = res.data?.payrollRun?.id;
      setGeneratedMeta({
        employees: res.data?.employeesCount || 0,
        workingDays: res.data?.workingDays || 0,
        runId: newRunId,
      });
      setSuccess("Payroll generated.");
      const today = new Date();
      setYear(String(today.getFullYear()));
      setMonth(String(today.getMonth() + 1));
      setRestrictEmployees(false);
      setSelectedEmployeeIds([]);
      if (newRunId) {
        setRunId(newRunId);
        await loadRun(newRunId);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Generate failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!run) return;
    setMessage("");
    setSuccess("");
    setLoading(true);
    try {
      await finalizePayroll(run.id);
      setSuccess("Payroll finalized.");
      await loadRun(run.id);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Finalize failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!run) return;
    setMessage("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await exportPayrollBankExcel(run.id);
      const filename = getFilenameFromDisposition(
        res.headers?.["content-disposition"],
        `payroll_${run.year}_${run.month}.xlsx`
      );
      downloadBlob(res.data, filename);
      setSuccess("Bank export downloaded.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Export failed.");
    } finally {
      setLoading(false);
    }
  };

  const runLabel = (item) => {
    const ym = `${item.year}-${String(item.month).padStart(2, "0")}`;
    const count = item._count?.items || 0;
    return `${ym} • ${item.status} • ${count} employees`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Payroll</h2>
          <p className="muted">Generate, review, and finalize payroll runs.</p>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="cards-grid">
        <section className="card">
          <h3>Generate Payroll</h3>
          {canWrite ? (
            <form className="form" onSubmit={handleGenerate}>
              <label className="field">
                Year
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Month
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  required
                />
              </label>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={restrictEmployees}
                  onChange={handleRestrictToggle}
                  disabled={employeesLoading}
                />
                <span>Generate for selected employees only</span>
              </label>
              {restrictEmployees ? (
                <label className="field">
                  Employees
                  <select
                    multiple
                    size={6}
                    value={selectedEmployeeIds}
                    onChange={handleEmployeeSelect}
                    disabled={employeesLoading}
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </option>
                    ))}
                  </select>
                  <div className="muted">
                    {employeesLoading
                      ? "Loading employees..."
                      : "Leave empty to generate for all active employees."}
                  </div>
                </label>
              ) : null}
              <button type="submit" disabled={loading}>
                {loading ? "Generating..." : "Generate Payroll"}
              </button>
            </form>
          ) : (
            <div className="muted">
              Read-only access. HR or CEO can generate payroll.
            </div>
          )}
        </section>

        <section className="card">
          <h3>Load Payroll Run</h3>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              loadRuns(runSearch);
            }}
          >
            <label className="field">
              Search runs
              <input
                value={runSearch}
                onChange={(e) => setRunSearch(e.target.value)}
                placeholder="Search by run id or YYYY-MM"
              />
            </label>
            <label className="field">
              Status
              <select
                value={runStatusFilter}
                onChange={(e) => {
                  setRunStatusFilter(e.target.value);
                }}
              >
                <option value="">All</option>
                <option value="DRAFT">DRAFT</option>
                <option value="FINAL">FINAL</option>
              </select>
            </label>
            <button
              type="submit"
              className="button-outline"
              disabled={runLoading}
            >
              {runLoading ? "Searching..." : "Search"}
            </button>
          </form>

          <div className="form">
            <label className="field">
              Payroll run
              <select
                value={selectedRunId}
                onChange={(e) => {
                  setSelectedRunId(e.target.value);
                  setRunId(e.target.value);
                }}
              >
                <option value="">Select a payroll run</option>
                {runs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {runLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button-outline"
              disabled={loading || !selectedRunId}
              onClick={() => loadRun(selectedRunId)}
            >
              {loading ? "Loading..." : "Load Selected"}
            </button>
          </div>
        </section>
      </div>

      {run ? (
        <div className="split-view">
          <section className="card list-panel">
            <div className="table-toolbar">
              <div className="muted">
                Employees: {run.items?.length || 0}
              </div>
              <label className="field">
                Row limit
                <select
                  value={itemLimit}
                  onChange={(e) => {
                    setItemLimit(Number(e.target.value));
                    setItemPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            <div className="data-table hr-table payroll-table">
              <div className="data-row data-header payroll-row">
                <div>Employee</div>
                <div>Days</div>
                <div>Gross</div>
                <div>Advance</div>
                <div>Late Deduct</div>
                <div>Net</div>
              </div>
              {pagedPayrollItems.length ? (
                pagedPayrollItems.map((item) => {
                  const position = item.employee?.position || "";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`data-row data-button payroll-row ${
                        selectedItem?.id === item.id ? "data-selected" : ""
                      }`}
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="payroll-employee">
                        <span className="payroll-employee-name">
                          {item.employee?.fullName || "-"}
                        </span>
                        {position ? (
                          <>
                            <span className="payroll-employee-sep">•</span>
                            <span className="payroll-employee-position muted">
                              {position}
                            </span>
                          </>
                        ) : null}
                      </div>
                    <div>
                      {item.daysPresent}/{item.workingDays}
                    </div>
                    <div>{money(item.grossPay)}</div>
                    <div>{money(item.advanceDeduction)}</div>
                    <div>{money(item.lateDeduction)}</div>
                    <div>{money(item.netPay)}</div>
                    </button>
                  );
                })
              ) : (
                <div className="muted">No payroll items.</div>
              )}
            </div>
            <div className="table-toolbar">
              <div className="pagination">
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => setItemPage((prev) => Math.max(prev - 1, 1))}
                  disabled={itemPage <= 1}
                >
                  Prev
                </button>
                <span>
                  Page {itemPage} of {itemPages}
                </span>
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => setItemPage((prev) => Math.min(prev + 1, itemPages))}
                  disabled={itemPage >= itemPages}
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          <section className="card preview-panel">
            <h3>Payroll Run</h3>
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Year</div>
                  <div className="stat-value">{run.year}</div>
                </div>
                <div>
                  <div className="stat-label">Month</div>
                  <div className="stat-value">{run.month}</div>
                </div>
                <div>
                  <div className="stat-label">Status</div>
                  <div className="stat-value">{run.status}</div>
                </div>
                <div>
                  <div className="stat-label">Total Net</div>
                  <div className="stat-value">{money(run.totalNet)}</div>
                </div>
                <div>
                  <div className="stat-label">Employees</div>
                  <div className="stat-value">
                    {run.items?.length || generatedMeta?.employees || 0}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Working days</div>
                  <div className="stat-value">
                    {run.items?.[0]?.workingDays ||
                      generatedMeta?.workingDays ||
                      "-"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Generated By</div>
                  <div className="stat-value">
                    {run.generatedBy?.fullName || "-"}
                  </div>
                </div>
              </div>

              <div className="button-row">
                {canWrite ? (
                  <button
                    type="button"
                    className="button-outline"
                    onClick={handleExport}
                    disabled={loading}
                  >
                    Download Bank Excel
                  </button>
                ) : null}
                {canWrite && run.status !== "FINAL" ? (
                  <button
                    type="button"
                    onClick={handleFinalize}
                    disabled={loading}
                  >
                    Finalize Payroll
                  </button>
                ) : null}
              </div>
            </div>

            <div className="divider" />

            {selectedItem ? (
              <div className="stack">
                <h4>Employee Details</h4>
                <div className="stat-grid">
                  <div>
                    <div className="stat-label">Employee</div>
                    <div className="stat-value">
                      {selectedItem.employee?.fullName || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Base Salary</div>
                    <div className="stat-value">
                      {money(selectedItem.baseSalary)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Days Present</div>
                    <div className="stat-value">
                      {selectedItem.daysPresent}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Working Days</div>
                    <div className="stat-value">
                      {selectedItem.workingDays}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Late Count</div>
                    <div className="stat-value">{selectedItem.lateCount}</div>
                  </div>
                  <div>
                    <div className="stat-label">Gross Pay</div>
                    <div className="stat-value">
                      {money(selectedItem.grossPay)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Advance Deduction</div>
                    <div className="stat-value">
                      {money(selectedItem.advanceDeduction)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Late Deduction</div>
                    <div className="stat-value">
                      {money(selectedItem.lateDeduction)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Net Pay</div>
                    <div className="stat-value">
                      {money(selectedItem.netPay)}
                    </div>
                  </div>
                </div>
                <div className="muted-block">
                  Bank: {selectedItem.employee?.bankName || "-"} | Account:{" "}
                  {selectedItem.employee?.bankAccount || "-"}
                </div>
              </div>
            ) : (
              <div className="muted">Select an employee to preview details.</div>
            )}
          </section>
        </div>
      ) : (
        <div className="muted">No payroll run loaded.</div>
      )}
    </div>
  );
}
