// What this does: lists invoices with filters, preview, and POS actions
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { fetchReceiptHtml, getInvoice, listInvoices } from "../../api/sales";
import { listLocations } from "../../api/inventory";
import {
  confirmEbm,
  createReturn,
  downloadInvoicePdf,
  getEbmInput,
  getInvoiceJson,
} from "../../api/pos";
import Modal from "../../components/Modal";
import { downloadBlob, getFilenameFromDisposition } from "../../utils/download";

const periods = [
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

function parseQty(value) {
  if (value == null) return 0;
  const normalized = String(value).replace(",", ".").trim();
  if (!normalized) return 0;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

export default function InvoiceList() {
  const { user } = useAuth();
  const role = String(user?.role || "").toUpperCase();
  const canConfirmEbm = ["CASHIER", "MANAGER", "CEO"].includes(role);
  const canReturn = ["CASHIER", "MANAGER", "CEO"].includes(role);
  const [period, setPeriod] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [locationId, setLocationId] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);

  const [locations, setLocations] = useState([]);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [range, setRange] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [sale, setSale] = useState(null);
  const [loadingSale, setLoadingSale] = useState(false);

  const [pdfFormat, setPdfFormat] = useState("a4");
  const [showJson, setShowJson] = useState(false);
  const [jsonPayload, setJsonPayload] = useState(null);

  const [showEbmInput, setShowEbmInput] = useState(false);
  const [ebmInput, setEbmInput] = useState(null);

  const [showEbmConfirm, setShowEbmConfirm] = useState(false);
  const [ebmInvoiceNo, setEbmInvoiceNo] = useState("");
  const [ebmSignature, setEbmSignature] = useState("");
  const [ebmQr, setEbmQr] = useState("");
  const [ebmIssuedAt, setEbmIssuedAt] = useState("");

  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnItems, setReturnItems] = useState([]);

  const totalPages = meta?.pages || 1;

  const queryParams = useMemo(() => {
    const params = {
      page,
      limit,
      q: q.trim() || undefined,
      locationId: locationId || undefined,
    };
    if (period === "custom") {
      if (from) params.from = from;
      if (to) params.to = to;
    } else {
      params.period = period;
    }
    return params;
  }, [page, limit, q, locationId, period, from, to]);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const res = await listLocations();
        setLocations(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        setMessage(err?.response?.data?.message || "Failed to load locations.");
      }
    };
    loadLocations();
  }, []);

  const loadInvoices = async () => {
    setMessage("");
    setSuccess("");
    setLoadingList(true);
    if (period === "custom" && (!from || !to)) {
      setLoadingList(false);
      setMessage("Select both From and To dates for custom range.");
      return;
    }
    try {
      const res = await listInvoices(queryParams);
      setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
      setMeta(res.data?.meta || null);
      setRange(res.data?.range || null);
      if (
        selectedId &&
        !(res.data?.rows || []).some((row) => row.id === selectedId)
      ) {
        setSelectedId(null);
        setSale(null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load invoices.");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [queryParams]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput);
  };

  const selectSale = async (id) => {
    setSelectedId(id);
    setLoadingSale(true);
    setMessage("");
    setSuccess("");
    try {
      const res = await getInvoice(id);
      setSale(res.data?.sale || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load invoice.");
    } finally {
      setLoadingSale(false);
    }
  };

  const printReceipt = async () => {
    if (!sale) return;
    const res = await fetchReceiptHtml(sale.id);
    const html = res.data;
    const win = window.open("", "_blank");
    if (!win) {
      alert("Popup blocked. Allow popups to print receipt.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const handleDownloadPdf = async () => {
    if (!sale) return;
    setMessage("");
    setSuccess("");
    try {
      const res = await downloadInvoicePdf(sale.id, pdfFormat);
      const filename = getFilenameFromDisposition(
        res.headers?.["content-disposition"],
        `${sale.invoiceNo}.pdf`
      );
      downloadBlob(res.data, filename);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to download PDF.");
    }
  };

  const handleViewJson = async () => {
    if (!sale) return;
    setSuccess("");
    try {
      const res = await getInvoiceJson(sale.id);
      setJsonPayload(res.data || null);
      setShowJson(true);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load invoice JSON.");
    }
  };

  const handleEbmInput = async () => {
    if (!sale) return;
    setSuccess("");
    try {
      const res = await getEbmInput(sale.id);
      setEbmInput(res.data || null);
      setShowEbmInput(true);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load EBM input.");
    }
  };

  const handleEbmConfirm = async () => {
    if (!sale) return;
    if (!canConfirmEbm) {
      setMessage("Only Cashier, Manager, or CEO can confirm EBM.");
      return;
    }
    setMessage("");
    setSuccess("");
    if (!ebmInvoiceNo.trim()) {
      setMessage("EBM invoice number is required.");
      return;
    }
    try {
      await confirmEbm(sale.id, {
        ebmInvoiceNo: ebmInvoiceNo.trim(),
        ebmReceiptSignature: ebmSignature.trim(),
        ebmQrPayload: ebmQr.trim() || undefined,
        ebmIssuedAt: ebmIssuedAt || undefined,
      });
      setShowEbmConfirm(false);
      setEbmInvoiceNo("");
      setEbmSignature("");
      setEbmQr("");
      setEbmIssuedAt("");
      await selectSale(sale.id);
      setSuccess("EBM confirmed.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to confirm EBM.");
    }
  };

  const openReturn = () => {
    if (!sale) return;
    if (!canReturn) {
      setMessage("Only Cashier, Manager, or CEO can create returns.");
      return;
    }
    setReturnReason("");
    setReturnItems(
      (sale.items || []).map((it) => ({
        saleItemId: it.id,
        productId: it.productId || it.product?.id,
        locationId: it.locationId || it.location?.id,
        binId: it.binId || it.bin?.id,
        maxQty: Number(it.quantity || 0),
        qty: 0,
        label: `${it.product?.name || "Item"} (BIN ${it.bin?.code || "-"})`,
      }))
    );
    setShowReturn(true);
  };

  const handleReturnSubmit = async () => {
    if (!sale) return;
    setMessage("");
    setSuccess("");
    const items = returnItems
      .map((it) => ({ ...it, qty: parseQty(it.qty) }))
      .filter((it) => it.qty > 0)
      .map((it) => ({
        saleItemId: it.saleItemId,
        productId: it.productId,
        locationId: it.locationId,
        binId: it.binId,
        quantity: it.qty,
      }));

    if (!returnReason.trim()) {
      setMessage("Return reason is required.");
      return;
    }
    if (items.length === 0) {
      setMessage("Select at least one item to return.");
      return;
    }

    try {
      await createReturn(sale.id, {
        reason: returnReason.trim(),
        items,
      });
      setShowReturn(false);
      setReturnReason("");
      setReturnItems([]);
      await selectSale(sale.id);
      setSuccess("Return created.");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to create return.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Invoices</h2>
          <p className="muted">
            {range
              ? `Period: ${range.period || "custom"}${range.from ? ` (${range.from} to ${range.to})` : ""}`
              : "Filter and preview invoices."}
          </p>
        </div>
        <button type="button" className="button-outline" onClick={loadInvoices}>
          Refresh
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <form className="filters-grid" onSubmit={handleSearch}>
        <label className="field">
          Period
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
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
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            disabled={period !== "custom"}
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
            disabled={period !== "custom"}
          />
        </label>

        <label className="field">
          Location
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Search
          <input
            placeholder="Invoice, buyer name, TIN, phone"
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
          <button type="submit">Apply Filters</button>
        </div>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">
              {meta ? `Total: ${meta.total}` : "Invoices"}
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
            <div className="data-row data-header">
            <div>SDC ID</div>
            <div>Date</div>
            <div>Buyer</div>
            <div>Payment</div>
            <div>Total</div>
            <div>EBM</div>
            </div>
            {loadingList ? (
              <div className="muted">Loading invoices...</div>
            ) : rows.length ? (
              rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`data-row data-button ${
                    row.id === selectedId ? "data-selected" : ""
                  }`}
                  onClick={() => selectSale(row.id)}
                >
                <div>{row.ebmInvoiceNo || row.invoiceNo}</div>
                  <div>{new Date(row.createdAt).toLocaleString()}</div>
                  <div>{row.buyerName || row.buyerTin || "-"}</div>
                  <div>{row.paymentMethod}</div>
                  <div>{money(row.total)}</div>
                  <div className="badge">{row.ebmStatus || "PENDING"}</div>
                </button>
              ))
            ) : (
              <div className="muted">No invoices found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Invoice Preview</h3>
          {loadingSale ? (
            <div className="muted">Loading invoice...</div>
          ) : sale ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Invoice</div>
                  <div className="stat-value">{sale.invoiceNo}</div>
                </div>
                <div>
                  <div className="stat-label">Date</div>
                  <div className="stat-value">
                    {new Date(sale.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Cashier</div>
                  <div className="stat-value">{sale.cashier?.fullName}</div>
                </div>
                <div>
                  <div className="stat-label">Payment</div>
                  <div className="stat-value">{sale.paymentMethod}</div>
                </div>
                <div>
                  <div className="stat-label">Buyer Type</div>
                  <div className="stat-value">
                    {sale.buyerType || "INDIVIDUAL"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Buyer</div>
                  <div className="stat-value">
                    {sale.buyerName || sale.buyerTin || "-"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Buyer Phone</div>
                  <div className="stat-value">{sale.buyerPhone || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Total</div>
                  <div className="stat-value">{money(sale.total)}</div>
                </div>
                <div>
                  <div className="stat-label">EBM</div>
                  <div className="stat-value">{sale.ebmStatus || "PENDING"}</div>
                </div>
              </div>

              <div className="button-row">
                <button type="button" onClick={printReceipt}>
                  Print Receipt
                </button>
                <button type="button" onClick={handleDownloadPdf}>
                  Download PDF
                </button>
                <button type="button" className="button-outline" onClick={handleViewJson}>
                  View JSON
                </button>
              </div>

              <div className="field">
                <label>PDF Format</label>
                <select
                  value={pdfFormat}
                  onChange={(e) => setPdfFormat(e.target.value)}
                >
                  <option value="a4">A4</option>
                  <option value="80mm">80mm</option>
                </select>
              </div>

              <div className="divider" />

              <h4>Items</h4>
              <div className="table-compact">
                {(sale.items || []).map((item) => (
                  <div key={item.id} className="table-row">
                    <div>
                      {item.product?.name} ({item.product?.sku})
                    </div>
                    <div>Qty {item.quantity}</div>
                    <div>BIN {item.bin?.code}</div>
                    <div>{money(item.lineTotal)}</div>
                  </div>
                ))}
              </div>

              <div className="divider" />

              <div className="button-row">
                <button type="button" className="button-outline" onClick={handleEbmInput}>
                  EBM Input
                </button>
                {canConfirmEbm ? (
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => {
                      setEbmInvoiceNo(sale?.ebmInvoiceNo || "");
                      setShowEbmConfirm(true);
                    }}
                  >
                    Confirm EBM
                  </button>
                ) : null}
                {canReturn ? (
                  <button type="button" className="button-outline" onClick={openReturn}>
                    Create Return
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="muted">Select an invoice to preview details.</div>
          )}
        </section>
      </div>

      <Modal
        open={showJson}
        onClose={() => setShowJson(false)}
        title="Invoice JSON"
      >
        <pre className="code-block">
          {JSON.stringify(jsonPayload, null, 2)}
        </pre>
      </Modal>

      <Modal
        open={showEbmInput}
        onClose={() => setShowEbmInput(false)}
        title="EBM Input"
      >
        {ebmInput ? (
          <div className="stack">
          <div className="stat-grid">
            <div>
              <div className="stat-label">Invoice</div>
              <div className="stat-value">{ebmInput.invoiceNo}</div>
            </div>
            <div>
              <div className="stat-label">Payment</div>
              <div className="stat-value">{ebmInput.paymentMethod}</div>
            </div>
            <div>
              <div className="stat-label">Buyer Type</div>
              <div className="stat-value">
                {ebmInput.buyer?.type || "INDIVIDUAL"}
              </div>
            </div>
            <div>
              <div className="stat-label">Buyer</div>
              <div className="stat-value">
                {ebmInput.buyer?.name || ebmInput.buyer?.tin || "-"}
              </div>
            </div>
            <div>
              <div className="stat-label">Buyer Phone</div>
              <div className="stat-value">
                {ebmInput.buyer?.phone || "-"}
              </div>
            </div>
            <div>
              <div className="stat-label">Total</div>
              <div className="stat-value">{ebmInput.totals?.total}</div>
            </div>
          </div>
            <div className="table-compact">
              {ebmInput.items?.map((item, idx) => (
                <div key={idx} className="table-row">
                  <div>{item.name}</div>
                  <div>Qty {item.qty}</div>
                  <div>{item.pickFrom}</div>
                  <div>{money(item.lineTotal)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="muted">No EBM data.</div>
        )}
      </Modal>

      <Modal
        open={showEbmConfirm}
        onClose={() => {
          setShowEbmConfirm(false);
          setEbmInvoiceNo("");
          setEbmSignature("");
          setEbmQr("");
          setEbmIssuedAt("");
        }}
        title="Confirm EBM"
        footer={
          <div className="button-row">
            <button
              type="button"
              className="button-outline"
              onClick={() => {
                setShowEbmConfirm(false);
                setEbmInvoiceNo("");
                setEbmSignature("");
                setEbmQr("");
                setEbmIssuedAt("");
              }}
            >
              Cancel
            </button>
            <button type="button" onClick={handleEbmConfirm}>
              Confirm
            </button>
          </div>
        }
      >
        <div className="form">
          <div className="field">
            <label>EBM invoice number (required)</label>
            <input
              value={ebmInvoiceNo}
              onChange={(e) => setEbmInvoiceNo(e.target.value)}
              placeholder="EBM invoice number"
            />
          </div>
              <div className="field">
                <label>SDC ID</label>
                <input
                  value={ebmSignature}
                  onChange={(e) => setEbmSignature(e.target.value)}
                  placeholder="SDC ID as issued by EBM"
                />
              </div>
          <div className="field">
            <label>QR payload (optional)</label>
            <input
              value={ebmQr}
              onChange={(e) => setEbmQr(e.target.value)}
              placeholder="QR payload"
            />
          </div>
          <div className="field">
            <label>Issued at (optional)</label>
            <input
              type="datetime-local"
              value={ebmIssuedAt}
              onChange={(e) => setEbmIssuedAt(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showReturn}
        onClose={() => setShowReturn(false)}
        title="Create Return"
        footer={
          <div className="button-row">
            <button type="button" className="button-outline" onClick={() => setShowReturn(false)}>
              Cancel
            </button>
            <button type="button" onClick={handleReturnSubmit}>
              Submit Return
            </button>
          </div>
        }
      >
        <div className="form">
          <div className="field">
            <label>Reason</label>
            <input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Reason for return"
            />
          </div>
          <div className="stack">
            {returnItems.map((item, idx) => (
              <div
                key={`${item.productId || "item"}-${item.binId || idx}`}
                className="return-row"
              >
                <div className="return-label">{item.label}</div>
                <input
                  type="number"
                  min={0}
                  max={item.maxQty}
                  value={item.qty}
                onChange={(e) => {
                    const val = parseQty(e.target.value);
                    setReturnItems((prev) =>
                      prev.map((row, rIdx) =>
                        rIdx === idx ? { ...row, qty: val } : row
                      )
                    );
                  }}
                />
                <div className="muted">Max {item.maxQty}</div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
