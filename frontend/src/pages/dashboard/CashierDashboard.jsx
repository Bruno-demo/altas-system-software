import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  closeShift,
  exportShiftExcel,
  getDailyReport,
  getOpenShift,
  openShift,
} from "../../api/pos";
import { downloadBlob, getFilenameFromDisposition } from "../../utils/download";

const emptyCounted = {
  CASH: "",
  MOMO: "",
  CARD: "",
  BANK: "",
  OTHER: "",
};

export default function CashierDashboard() {
  const [shift, setShift] = useState(null);
  const [lastClosed, setLastClosed] = useState(null);
  const [loadingShift, setLoadingShift] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [openNote, setOpenNote] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [counted, setCounted] = useState(emptyCounted);

  const [reportDate, setReportDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const loadShift = async () => {
    try {
      const res = await getOpenShift();
      setShift(res.data?.shift || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load shift.");
    }
  };

  useEffect(() => {
    loadShift();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleOpenShift = async () => {
    setMessage("");
    setSuccess("");
    setLoadingShift(true);
    try {
      const res = await openShift({ note: openNote.trim() || undefined });
      setShift(res.data?.shift || null);
      setSuccess("Shift opened.");
      setOpenNote("");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to open shift.");
    } finally {
      setLoadingShift(false);
    }
  };

  const handleCloseShift = async () => {
    setMessage("");
    setSuccess("");
    setLoadingShift(true);
    try {
      const payload = {
        note: closeNote.trim() || undefined,
        counted: {
          CASH: Number(counted.CASH || 0),
          MOMO: Number(counted.MOMO || 0),
          CARD: Number(counted.CARD || 0),
          BANK: Number(counted.BANK || 0),
          OTHER: Number(counted.OTHER || 0),
        },
      };
      const res = await closeShift(payload);
      setShift(null);
      setLastClosed(res.data?.shift || null);
      setSuccess("Shift closed.");
      setCounted(emptyCounted);
      setCloseNote("");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to close shift.");
    } finally {
      setLoadingShift(false);
    }
  };

  const handleShiftDownload = async (shiftId) => {
    setMessage("");
    try {
      const res = await exportShiftExcel(shiftId);
      const filename = getFilenameFromDisposition(
        res.headers?.["content-disposition"],
        `shift-${shiftId}.xlsx`
      );
      downloadBlob(res.data, filename);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to download shift.");
    }
  };

  const handleLoadReport = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoadingReport(true);
    try {
      const res = await getDailyReport(reportDate);
      setReport(res.data);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load report.");
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Cashier Dashboard</h2>
          <p className="muted">Shift control, daily totals, and quick access.</p>
        </div>
        <div className="button-row">
          <Link className="button-outline" to="/pos">
            POS Terminal
          </Link>
          <Link className="button-outline" to="/invoices">
            Invoice List
          </Link>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="cards-grid">
        <section className="card">
          <h3>Shift</h3>
          <p className="muted">
            Open a shift before making sales. Close it with counted cash.
          </p>

          {shift ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Status</div>
                  <div className="stat-value">{shift.status}</div>
                </div>
                <div>
                  <div className="stat-label">Opened</div>
                  <div className="stat-value">
                    {new Date(shift.openedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="form">
                <div className="field">
                  <label>Counted CASH</label>
                  <input
                    type="number"
                    value={counted.CASH}
                    onChange={(e) =>
                      setCounted((prev) => ({
                        ...prev,
                        CASH: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Counted MOMO</label>
                  <input
                    type="number"
                    value={counted.MOMO}
                    onChange={(e) =>
                      setCounted((prev) => ({
                        ...prev,
                        MOMO: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Counted CARD</label>
                  <input
                    type="number"
                    value={counted.CARD}
                    onChange={(e) =>
                      setCounted((prev) => ({
                        ...prev,
                        CARD: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Counted BANK</label>
                  <input
                    type="number"
                    value={counted.BANK}
                    onChange={(e) =>
                      setCounted((prev) => ({
                        ...prev,
                        BANK: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Counted OTHER</label>
                  <input
                    type="number"
                    value={counted.OTHER}
                    onChange={(e) =>
                      setCounted((prev) => ({
                        ...prev,
                        OTHER: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Closing note</label>
                  <input
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder="Optional note"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCloseShift}
                  disabled={loadingShift}
                >
                  {loadingShift ? "Closing..." : "Close Shift"}
                </button>
              </div>
            </div>
          ) : (
            <div className="form">
              <div className="field">
                <label>Opening note</label>
                <input
                  value={openNote}
                  onChange={(e) => setOpenNote(e.target.value)}
                  placeholder="Optional note"
                />
              </div>
              <button
                type="button"
                onClick={handleOpenShift}
                disabled={loadingShift}
              >
                {loadingShift ? "Opening..." : "Open Shift"}
              </button>
            </div>
          )}

          {lastClosed ? (
            <div className="card muted-block">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Shift Closed</div>
                  <div className="stat-value">
                    {new Date(lastClosed.closedAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Sales Count</div>
                  <div className="stat-value">{lastClosed.salesCount}</div>
                </div>
                <div>
                  <div className="stat-label">Expected Total</div>
                  <div className="stat-value">{lastClosed.expectedTotal}</div>
                </div>
                <div>
                  <div className="stat-label">Counted Total</div>
                  <div className="stat-value">{lastClosed.countedTotal}</div>
                </div>
                <div>
                  <div className="stat-label">Difference</div>
                  <div className="stat-value">{lastClosed.diffTotal}</div>
                </div>
              </div>
              <button
                type="button"
                className="button-outline"
                onClick={() => handleShiftDownload(lastClosed.id)}
              >
                Download Shift Report
              </button>
            </div>
          ) : null}
        </section>

        <section className="card">
          <h3>Daily Report</h3>
          <p className="muted">Totals grouped by payment method.</p>

          <form className="filter-row" onSubmit={handleLoadReport}>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <button type="submit" disabled={loadingReport}>
              {loadingReport ? "Loading..." : "Load"}
            </button>
          </form>

          {report ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Invoices</div>
                <div className="stat-value">{report.countInvoices}</div>
              </div>
              <div>
                <div className="stat-label">Subtotal</div>
                <div className="stat-value">{report.subtotal}</div>
              </div>
              <div>
                <div className="stat-label">Discount</div>
                <div className="stat-value">{report.discountTotal}</div>
              </div>
              <div>
                <div className="stat-label">Total</div>
                <div className="stat-value">{report.total}</div>
              </div>
              {Object.entries(typeof report.byPayment === 'object' && report.byPayment !== null ? report.byPayment : {}).map(([key, value]) => (
                <div key={key}>
                  <div className="stat-label">{key}</div>
                  <div className="stat-value">{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">Select a date to view totals.</div>
          )}
        </section>
      </div>

      <section className="card quick-actions">
        <h3>Quick Actions</h3>
        <div className="button-row">
          <Link className="button-outline" to="/pos">
            Start Sale
          </Link>
          <Link className="button-outline" to="/pos/search">
            Product Search
          </Link>
          <Link className="button-outline" to="/invoices">
            Review Invoices
          </Link>
        </div>
      </section>
    </div>
  );
}
