import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createPromotion,
  deletePromotion,
  exportPromotions,
  importPromotions,
  listPromotions,
  updatePromotion,
} from "../../api/motorbikes";
import { downloadBlob, getFilenameFromDisposition } from "../../utils/download";

const emptyForm = {
  countingNumber: "",
  date: "",
  customerName: "",
  chassisNumber: "",
  plateNumber: "",
  model: "",
  phoneNumber: "",
  delivered: false,
  stubPaid: false,
  branchName: "muhima",
};

function toInputDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

const SORTABLE_FIELDS = {
  countingNumber: (row) => Number(row.countingNumber || 0),
  date: (row) => new Date(row.date || 0).getTime(),
  customerName: (row) => String(row.customerName || "").toLowerCase(),
  chassisNumber: (row) => String(row.chassisNumber || "").toLowerCase(),
  branchName: (row) => String(row.branchName || "").toLowerCase(),
};

export default function Promotions() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [deliveredFilter, setDeliveredFilter] = useState("");
  const [stubPaidFilter, setStubPaidFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortKey, setSortKey] = useState("countingNumber");
  const [sortDir, setSortDir] = useState("asc");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [searchParams] = useSearchParams();
  const lastPrefill = useRef("");

  const totalPages = meta?.pages || 1;

  const loadPromotions = async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = {
        page,
        limit,
        q: q.trim() || undefined,
        delivered: deliveredFilter || undefined,
        stubPaid: stubPaidFilter || undefined,
        branchName: branchFilter.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      };
      const res = await listPromotions(params);
      setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setMeta(res.data?.meta || null);
      if (selected && !(res.data?.rows || []).some((row) => row.id === selected.id)) {
        setSelected(null);
        setEditingId(null);
        setForm(emptyForm);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load promotions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromotions();
  }, [page, limit, q, deliveredFilter, stubPaidFilter, branchFilter, from, to]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    const chassis = searchParams.get("chassis");
    if (!chassis || chassis === lastPrefill.current) return;
    const model = searchParams.get("model") || "";
    const branch = searchParams.get("branch") || "muhima";
    setSelected(null);
    setEditingId(null);
    setForm({
      ...emptyForm,
      chassisNumber: chassis,
      model,
      branchName: branch,
    });
    lastPrefill.current = chassis;
  }, [searchParams]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput);
  };

  const selectRow = (row) => {
    setSelected(row);
    setEditingId(row.id);
    setForm({
      countingNumber: row.countingNumber || "",
      date: toInputDate(row.date),
      customerName: row.customerName || "",
      chassisNumber: row.chassisNumber || "",
      plateNumber: row.plateNumber || "",
      model: row.model || "",
      phoneNumber: row.phoneNumber || "",
      delivered: Boolean(row.delivered),
      stubPaid: Boolean(row.stubPaid),
      branchName: row.branchName || "",
    });
  };

  const resetForm = () => {
    setSelected(null);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleFormChange = (field) => (event) => {
    const value =
      event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    if (!form.chassisNumber.trim()) {
      setMessage("Chassis number is required.");
      return;
    }

    const payload = {
      countingNumber: form.countingNumber.trim() || undefined,
      date: form.date || undefined,
      customerName: form.customerName.trim() || undefined,
      chassisNumber: form.chassisNumber.trim(),
      plateNumber: form.plateNumber.trim() || undefined,
      model: form.model.trim() || undefined,
      phoneNumber: form.phoneNumber.trim() || undefined,
      delivered: Boolean(form.delivered),
      stubPaid: Boolean(form.stubPaid),
      branchName: form.branchName.trim() || undefined,
    };

    try {
      if (editingId) {
        await updatePromotion(editingId, payload);
        setSuccess("Promotion updated.");
      } else {
        await createPromotion(payload);
        setSuccess("Promotion created.");
      }
      resetForm();
      loadPromotions();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Save failed.");
    }
  };

  const removeSelected = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete promotion for chassis ${selected.chassisNumber}?`
    );
    if (!confirmed) return;
    setMessage("");
    setSuccess("");
    try {
      await deletePromotion(selected.id);
      setSuccess("Promotion deleted.");
      resetForm();
      loadPromotions();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Delete failed.");
    }
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const handleImport = async () => {
    if (!importFile) {
      setMessage("Select an Excel (.xlsx) file to import.");
      return;
    }
    setMessage("");
    setSuccess("");
    setImporting(true);
    try {
      const fileBase64 = await toBase64(importFile);
      const res = await importPromotions({ fileBase64 });
      setSuccess(
        `Import completed. Inserted ${res.data?.inserted || 0}, skipped ${
          res.data?.skipped || 0
        }.`
      );
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadPromotions();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setMessage("");
    setSuccess("");
    setExporting(true);
    try {
      const params = {
        q: q.trim() || undefined,
        delivered: deliveredFilter || undefined,
        stubPaid: stubPaidFilter || undefined,
        branchName: branchFilter.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      };
      const res = await exportPromotions(params);
      const filename = getFilenameFromDisposition(
        res.headers?.["content-disposition"],
        "motorbike_sales_report.xlsx"
      );
      downloadBlob(res.data, filename);
      setSuccess("Sales report exported.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to export report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page promotions-page">
      <div className="page-header">
        <div>
          <h2>Promotions</h2>
          <p className="muted">
            Track motorbike promotions, plate details, and delivery status.
          </p>
        </div>
        <div className="button-row">
          <Link className="button-outline" to="/motorbikes">
            Motorbikes
          </Link>
          <button
            type="button"
            className="button-outline"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export Report"}
          </button>
          <button type="button" className="button-outline" onClick={loadPromotions}>
            Refresh
          </button>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <div className="split-view">
        <section className="card list-panel">
          <form className="filters-grid" onSubmit={handleSearch}>
            <label className="field">
              Search
              <input
                placeholder="Name, chassis, reg no, model, phone, branch"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </label>
            <label className="field">
              Delivered
              <select
                value={deliveredFilter}
                onChange={(e) => {
                  setDeliveredFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="field">
              Stub paid
              <select
                value={stubPaidFilter}
                onChange={(e) => {
                  setStubPaidFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="field">
              Branch
              <input
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="field">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="field">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
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
              {meta ? `Total: ${meta.total}` : "Promotions"}
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
            <div className="data-row data-header promotion-row">
              <div>S.NO</div>
              <div>Date</div>
              <div>Name</div>
              <div>Chasis Number</div>
              <div>Reg No</div>
              <div>Model</div>
              <div>Phone Number</div>
              <div>Delivered</div>
            </div>
            {loading ? (
              <div className="muted">Loading promotions...</div>
            ) : rows.length ? (
              rows.map((row, idx) => (
                <button
                  key={row.id}
                  type="button"
                  className={`data-row data-button promotion-row ${
                    selected?.id === row.id ? "data-selected" : ""
                  }`}
                  onClick={() => selectRow(row)}
                >
                  <div>{row.countingNumber || (page - 1) * limit + idx + 1}</div>
                  <div>{formatDate(row.date)}</div>
                  <div className="truncate">{row.customerName || "-"}</div>
                  <div className="truncate">{row.chassisNumber}</div>
                  <div className="truncate">{row.plateNumber || "-"}</div>
                  <div className="truncate">{row.model || "-"}</div>
                  <div className="truncate">{row.phoneNumber || "-"}</div>
                  <div>
                    <span className={`badge ${row.delivered ? "" : "badge-warn"}`}>
                      {row.delivered ? "Yes" : "No"}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="muted">No promotions found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <div className="table-toolbar">
            <h3>{editingId ? "Edit Promotion" : "Create Promotion"}</h3>
            <div className="button-row">
              <button type="button" className="button-outline" onClick={resetForm}>
                New
              </button>
              <button
                type="button"
                className="button-outline"
                onClick={removeSelected}
                disabled={!selected}
              >
                Delete
              </button>
            </div>
          </div>

          <form className="form form-wide" onSubmit={submit}>
            <label className="field">
              Count (auto)
              <input
                value={form.countingNumber}
                onChange={handleFormChange("countingNumber")}
                placeholder="Auto"
                readOnly
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
              Customer name
              <input
                value={form.customerName}
                onChange={handleFormChange("customerName")}
              />
            </label>
            <label className="field">
              Chassis number
              <input
                value={form.chassisNumber}
                onChange={handleFormChange("chassisNumber")}
                required
              />
            </label>
            <label className="field">
              Plate number
              <input
                value={form.plateNumber}
                onChange={handleFormChange("plateNumber")}
              />
            </label>
            <label className="field">
              Model
              <input value={form.model} onChange={handleFormChange("model")} />
            </label>
            <label className="field">
              Phone number
              <input
                value={form.phoneNumber}
                onChange={handleFormChange("phoneNumber")}
              />
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.delivered}
                onChange={handleFormChange("delivered")}
              />
              <span>Delivered</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.stubPaid}
                onChange={handleFormChange("stubPaid")}
              />
              <span>Stub paid</span>
            </label>
            <label className="field">
              Branch name
              <input
                value={form.branchName}
                onChange={handleFormChange("branchName")}
              />
            </label>
            <button type="submit">
              {editingId ? "Save Changes" : "Create Promotion"}
            </button>
          </form>

          <div className="divider" />

          <div className="stack">
            <h4>Import from Excel</h4>
            <div className="muted">
              Upload .xlsx with headers like S.NO, date, names, chassis number,
              reg no, model, phone number, delivered, stub paid, branch name.
            </div>
            <div className="form form-wide">
              <label className="field">
                Excel file (.xlsx)
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </label>
              <button type="button" onClick={handleImport} disabled={importing}>
                {importing ? "Importing..." : "Import Sheet"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
