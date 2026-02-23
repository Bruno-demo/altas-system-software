import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importSalesSdc, getImportedSalesSdc } from "../../api/reports";
import { useAuth } from "../../auth/AuthContext";
import { listInvoices, listMotorbikePrices, updateMotorbikePrice } from "../../api/sales";

const periods = [
  { value: "all", label: "All time" },
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

export default function SalesBrowse() {
  const { user } = useAuth();
  const canEditMotorbikePrices = ["SALESPERSON", "CASHIER", "MANAGER", "CEO"].includes(
    String(user?.role || "").toUpperCase()
  );

  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [range, setRange] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [sdcRows, setSdcRows] = useState([]);
  const [sdcMeta, setSdcMeta] = useState(null);
  const [sdcPage, setSdcPage] = useState(1);
  const [sdcLimit, setSdcLimit] = useState(20);
  const [sdcLoading, setSdcLoading] = useState(false);
  const [sdcMessage, setSdcMessage] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [motorbikeRows, setMotorbikeRows] = useState([]);
  const [motorbikeDraft, setMotorbikeDraft] = useState({});
  const [motorbikeLoading, setMotorbikeLoading] = useState(false);
  const [motorbikeSavingSku, setMotorbikeSavingSku] = useState("");
  const [motorbikeMessage, setMotorbikeMessage] = useState("");
  const [motorbikeSuccess, setMotorbikeSuccess] = useState("");
  const fileRef = useRef(null);

  const totalPages = meta?.pages || 1;
  const totalSdcPages = sdcMeta?.pages || 1;

  const params = useMemo(() => {
    const result = {
      page,
      limit,
      q: q.trim() || undefined,
    };
    if (period === "custom") {
      if (from) result.from = from;
      if (to) result.to = to;
    } else {
      result.period = period;
    }
    return result;
  }, [period, from, to, q, page, limit]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");
      try {
        const res = await listInvoices(params);
        setRows(res.data?.rows || []);
        setMeta(res.data?.meta || null);
        setRange(res.data?.range || null);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load sales.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params]);

  const loadSdc = useCallback(async () => {
    setSdcLoading(true);
    setSdcMessage("");
    try {
      const sdcParams = {
        page: sdcPage,
        limit: sdcLimit,
        q: q || undefined,
      };
      if (period === "custom") {
        if (from) sdcParams.from = from;
        if (to) sdcParams.to = to;
      } else {
        sdcParams.period = period;
      }
      const res = await getImportedSalesSdc(sdcParams);
      setSdcRows(res.data?.rows || []);
      setSdcMeta(res.data?.meta || null);
    } catch (err) {
      setSdcMessage(err?.response?.data?.message || "Failed to load SDC data.");
    } finally {
      setSdcLoading(false);
    }
  }, [period, from, to, q, sdcPage, sdcLimit]);

  useEffect(() => {
    loadSdc();
  }, [loadSdc]);

  useEffect(() => {
    setSdcPage(1);
  }, [period, from, to, q]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!motorbikeSuccess) return;
    const timer = setTimeout(() => setMotorbikeSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [motorbikeSuccess]);

  const loadMotorbikePrices = useCallback(async () => {
    setMotorbikeLoading(true);
    setMotorbikeMessage("");
    try {
      const res = await listMotorbikePrices();
      const rows = res.data?.rows || [];
      setMotorbikeRows(rows);
      const nextDraft = {};
      rows.forEach((row) => {
        nextDraft[row.sku] = String(row.sellPrice ?? "");
      });
      setMotorbikeDraft(nextDraft);
    } catch (err) {
      setMotorbikeMessage(err?.response?.data?.message || "Failed to load motorbike prices.");
    } finally {
      setMotorbikeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMotorbikePrices();
  }, [loadMotorbikePrices]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput);
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
    setImportSummary(null);
    setImporting(true);
    try {
      const fileBase64 = await toBase64(importFile);
      const res = await importSalesSdc({ fileBase64 });
      const inserted = res.data?.inserted ?? 0;
      const updated = res.data?.updated ?? 0;
      setImportSummary({ inserted, updated });
      setSuccess(`Import successful. ${inserted} rows inserted, ${updated} updated.`);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadSdc();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const rangeLabel = useMemo(() => {
    if (!range) return "";
    if (range.from && range.to) return `${range.from} - ${range.to}`;
    return range.period ? range.period.replace("_", " ").toUpperCase() : "";
  }, [range]);

  const saveMotorbikePrice = async (row) => {
    const raw = String(motorbikeDraft[row.sku] ?? "").trim();
    const price = Number(raw);

    if (!Number.isFinite(price) || price <= 0) {
      setMotorbikeMessage(`Price for ${row.name} must be greater than 0.`);
      return;
    }

    setMotorbikeMessage("");
    setMotorbikeSuccess("");
    setMotorbikeSavingSku(row.sku);
    try {
      await updateMotorbikePrice(row.sku, { sellPrice: price });
      setMotorbikeSuccess(`${row.name} price updated.`);
      await loadMotorbikePrices();
    } catch (err) {
      setMotorbikeMessage(err?.response?.data?.message || "Failed to update motorbike price.");
    } finally {
      setMotorbikeSavingSku("");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Sales Ledger</h2>
          <p className="muted">Search invoices and monitor recent sales.</p>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <form className="filters-grid" onSubmit={handleSearch}>
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
            placeholder="Invoice, buyer, TIN, phone"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
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
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
        <div className="filter-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Search"}
          </button>
        </div>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">{meta ? `Total: ${meta.total}` : "Invoices"}</div>
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
            <div className="data-row data-header">
              <div>Invoice</div>
              <div>Date</div>
              <div>Buyer</div>
              <div>Payment</div>
              <div>Total</div>
              <div>EBM</div>
            </div>
            {rows.length ? (
              rows.map((row) => (
                <div key={row.id} className="data-row">
                  <div>{row.invoiceNo}</div>
                  <div>{new Date(row.createdAt).toLocaleDateString()}</div>
                  <div>{row.buyerName || row.buyerTin || "-"}</div>
                  <div>{row.paymentMethod}</div>
                  <div>{money(row.total)}</div>
                  <div>{row.ebmStatus || "PENDING"}</div>
                </div>
              ))
            ) : (
              <div className="muted">{loading ? "Loading sales..." : "No invoices found."}</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Summary</h3>
          <div className="stack stack-tight">
            <div className="stat-grid">
              <div>
                <div className="stat-label">Range</div>
                <div className="stat-value">{rangeLabel || "-"}</div>
              </div>
              <div>
                <div className="stat-label">Shown</div>
                <div className="stat-value">{rows.length}</div>
              </div>
              <div>
                <div className="stat-label">Page</div>
                <div className="stat-value">
                  {page} / {totalPages}
                </div>
              </div>
            </div>
            <div className="muted">
              Search by invoice or buyer to quickly find sales; click "Search" after typing.
            </div>
          </div>
        </section>
      </div>

      <section className="card list-panel">
        <div className="table-toolbar">
          <div>
            <h3>Default POS Motorbike Prices</h3>
            <div className="muted">
              Update SPIRO/BAJAJ/DISCOVER sale prices used in cashier POS. Values are saved in the database.
            </div>
          </div>
          <button
            type="button"
            className="button-outline"
            onClick={loadMotorbikePrices}
            disabled={motorbikeLoading}
          >
            {motorbikeLoading ? "Refreshing..." : "Refresh Prices"}
          </button>
        </div>

        {motorbikeMessage ? <div className="alert">{motorbikeMessage}</div> : null}
        {motorbikeSuccess ? <div className="success">{motorbikeSuccess}</div> : null}

        <div className="data-table">
          <div className="data-row data-header motorbike-price-row">
            <div>Model</div>
            <div>SKU</div>
            <div>Sell price</div>
            <div>Action</div>
          </div>

          {motorbikeLoading ? (
            <div className="muted">Loading motorbike prices...</div>
          ) : motorbikeRows.length ? (
            motorbikeRows.map((row) => (
              <div key={row.sku} className="data-row motorbike-price-row">
                <div>{row.name}</div>
                <div>{row.sku}</div>
                <div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={motorbikeDraft[row.sku] ?? ""}
                    onChange={(e) =>
                      setMotorbikeDraft((prev) => ({
                        ...prev,
                        [row.sku]: e.target.value,
                      }))
                    }
                    disabled={!canEditMotorbikePrices || motorbikeSavingSku === row.sku}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => saveMotorbikePrice(row)}
                    disabled={!canEditMotorbikePrices || motorbikeSavingSku === row.sku}
                  >
                    {motorbikeSavingSku === row.sku ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="muted">No default motorbike prices found.</div>
          )}
        </div>
      </section>

      <section className="card list-panel">
        <div className="table-toolbar">
          <div className="muted">
            {sdcMeta ? `SDC rows: ${sdcMeta.total}` : "Imported sales SDC rows"}
            {sdcMessage ? ` | ${sdcMessage}` : ""}
          </div>
          <div className="pagination">
            <button
              type="button"
              className="button-outline"
              disabled={sdcPage <= 1}
              onClick={() => setSdcPage((p) => Math.max(p - 1, 1))}
            >
              Prev
            </button>
            <span>
              Page {sdcPage} of {totalSdcPages}
            </span>
            <button
              type="button"
              className="button-outline"
              disabled={sdcPage >= totalSdcPages}
              onClick={() => setSdcPage((p) => Math.min(p + 1, totalSdcPages))}
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
          {sdcLoading ? (
            <div className="muted">Loading SDC rows...</div>
          ) : sdcRows.length ? (
            sdcRows.map((row, idx) => (
              <div key={`${row.sdcId || "row"}-${idx}`} className="data-row sales-sdc-row">
                <div>{row.sdcId || "-"}</div>
                <div>{row.buyerTin || "-"}</div>
                <div>{row.buyerName || "-"}</div>
                <div>{row.saleDate ? new Date(row.saleDate).toLocaleDateString() : "-"}</div>
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
            <div className="muted">{sdcLoading ? "Loading..." : "No SDC rows found."}</div>
          )}
        </div>
      </section>

      <section className="card preview-panel">
        <div className="stack stack-tight">
          <div>
            <h3>Import Sales Ledger</h3>
            <div className="muted">
              Upload an Excel (.xlsx) file with headers: SDC ID, Buyer TIN, Buyer Name, Sale date,
              Receipt type, Item name, Quantity, Unit price, Taxable Supply Price, VAT, Summary Amount.
            </div>
          </div>
          {importSummary ? (
            <div className="muted">
              Last import: {importSummary.inserted} inserted, {importSummary.updated} updated.
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
            <button type="button" className="button-outline" onClick={handleImport} disabled={importing}>
              {importing ? "Importing..." : "Upload & Sync"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
