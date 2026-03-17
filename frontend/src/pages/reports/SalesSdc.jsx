import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getSalesSdc, importSalesSdc } from "../../api/reports";

const periods = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function money(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0.00";
  return n.toFixed(2);
}

export default function SalesSdc() {
  const { user } = useAuth();
  const canImport = ["CASHIER", "SALESPERSON", "MANAGER", "CEO"].includes(
    String(user?.role || "").toUpperCase()
  );
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(200);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [range, setRange] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const fileRef = useRef(null);

  const totalPages = meta?.pages || 1;

  const rangeLabel = useMemo(() => {
    if (!range) return "";
    if (range.from && range.to) return `${range.from} - ${range.to}`;
    return range.period ? range.period.replace("_", " ").toUpperCase() : "";
  }, [range]);

  const loadSdc = async () => {
    if (period === "custom" && (!from || !to)) {
      setMessage("Select both From and To dates for custom range.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const params = { limit, page };
      if (period === "custom") {
        params.from = from;
        params.to = to;
      } else {
        params.period = period;
      }

      const res = await getSalesSdc(params);
      setRows(res.data?.rows || []);
      setMeta(res.data?.meta || null);
      setRange(res.data?.range || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load SDC data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSdc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, from, to, limit, page]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

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
    setImportSummary(null);
    setImporting(true);
    try {
      const fileBase64 = await toBase64(importFile);
      const res = await importSalesSdc({ fileBase64 });
      const inserted = res.data?.inserted ?? 0;
      const updated = res.data?.updated ?? 0;
      setSuccess(
        `Import successful. ${inserted} rows inserted, ${updated} rows updated.`
      );
      setImportSummary({ inserted, updated });
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadSdc();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const applyFilters = (event) => {
    event.preventDefault();
    if (period === "custom" && (!from || !to)) {
      setMessage("Select both From and To dates for custom range.");
      return;
    }
    setPage(1);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>SDC Sales</h2>
          <p className="muted">
            Export-ready SDC report (includes refunds).{" "}
            {rangeLabel ? `Range: ${rangeLabel}` : "Select period to update."}
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button-outline" onClick={loadSdc} disabled={loading}>
            Reload
          </button>
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
          Row limit
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
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
            <div className="muted">{meta ? `Rows: ${meta.total}` : "SDC rows"}</div>
            <div className="pagination">
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1 || loading}
              >
                Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page >= totalPages || loading}
              >
                Next
              </button>
            </div>
          </div>

          <div className="data-table">
            <div className="data-row data-header sales-sdc-row">
              <div>SDC ID</div>
              <div>Buyer TIN</div>
              <div>Buyer Name</div>
              <div>Sale date</div>
              <div>Receipt type</div>
              <div>Item name</div>
              <div>Quantity</div>
              <div>Unit price</div>
              <div>Taxable Supply Price</div>
              <div>VAT</div>
              <div>Summary Amount</div>
            </div>
            {loading ? (
              <div className="muted">Loading SDC data...</div>
            ) : rows.length ? (
              rows.map((row, idx) => (
                <div key={`${row.sdcId || idx}-${idx}`} className="data-row sales-sdc-row">
                  <div>{row.sdcId || "-"}</div>
                  <div>{row.buyerTin || "-"}</div>
                  <div>{row.buyerName || "-"}</div>
                  <div>{row.saleDate ? new Date(row.saleDate).toLocaleDateString("en-GB") : "-"}</div>
                  <div>{row.receiptType || "-"}</div>
                  <div>{row.itemName || "-"}</div>
                  <div style={{ textAlign: "right" }}>{row.quantity ?? 0}</div>
                  <div style={{ textAlign: "right" }}>{money(row.unitPrice)}</div>
                  <div style={{ textAlign: "right" }}>{money(row.taxableSupplyPrice)}</div>
                  <div style={{ textAlign: "right" }}>{money(row.vat)}</div>
                  <div style={{ textAlign: "right" }}>{money(row.summaryAmount)}</div>
                </div>
              ))
            ) : (
              <div className="muted">No data.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Summary</h3>
          <div className="stack stack-tight">
            <div className="stat-grid">
              <div>
                <div className="stat-label">Rows</div>
                <div className="stat-value">{meta?.total ?? rows.length}</div>
              </div>
              <div>
                <div className="stat-label">Page</div>
                <div className="stat-value">
                  {page} / {totalPages}
                </div>
              </div>
              <div>
                <div className="stat-label">Range</div>
                <div className="stat-value">{rangeLabel || "-"}</div>
              </div>
            </div>
            <div className="muted">
              {rangeLabel
                ? `Showing ${rows.length} rows out of ${meta?.total ?? rows.length}.`
                : "Filters drive this view."}
            </div>
          </div>
          {canImport ? (
            <>
              <div className="divider" />
              <div className="stack">
                <div>
                  <h4>Import SDC Sheet</h4>
                  <div className="muted">
                    Upload an Excel (.xlsx) file with headers:
                    SDC ID, Buyer TIN, Buyer Name, Sale date, Receipt type, Item name,
                    Quantity, Unit price, Taxable Supply Price, VAT, Summary Amount.
                  </div>
                </div>
                {importSummary ? (
                  <div className="muted">
                    Last import: {importSummary.inserted} inserted, {importSummary.updated} updated rows.
                  </div>
                ) : null}
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
                    {importing ? "Importing..." : "Upload & Import"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

