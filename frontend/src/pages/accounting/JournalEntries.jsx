import { useEffect, useMemo, useState } from "react";
import Drawer from "../../components/Drawer";
import {
  createJournalEntry,
  listAccounts,
  listJournalEntries,
  reverseJournalEntry,
} from "../../api/accounting";

const periods = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom range" },
];

const sources = ["MANUAL", "SALE", "EXPENSE", "PAYROLL", "RETURN", "STOCK", "OTHER"];

function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyLine() {
  return { accountId: "", debit: "", credit: "", memo: "" };
}

export default function JournalEntries() {
  const [accounts, setAccounts] = useState([]);

  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1, limit: 50 });
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(toDateInput(new Date()));
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState([emptyLine()]);

  const rangeParams = useMemo(() => {
    if (period === "custom") return { from, to };
    return { period };
  }, [period, from, to]);

  const totals = useMemo(() => {
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    return {
      debit: totalDebit.toFixed(2),
      credit: totalCredit.toFixed(2),
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }, [lines]);

  const loadAccounts = async () => {
    try {
      const res = await listAccounts();
      setAccounts(res.data || []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load accounts.");
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listJournalEntries({
        ...rangeParams,
        page,
        limit,
        source: sourceFilter || undefined,
        q: query.trim() || undefined,
      });
      setRows(res.data?.rows || []);
      setMeta(res.data?.meta || { total: 0, page: 1, pages: 1, limit });
      if (selected) {
        const fresh = (res.data?.rows || []).find((row) => row.id === selected.id);
        setSelected(fresh || null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load journal entries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadEntries();
  }, [page, limit, rangeParams, sourceFilter]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    loadEntries();
  };

  const openDrawer = () => {
    setDrawerOpen(true);
    setEntryDate(toDateInput(new Date()));
    setMemo("");
    setReference("");
    setLines([emptyLine()]);
  };

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, idx) => idx !== index));

  const handleSave = async () => {
    setMessage("");
    setSuccess("");

    const filteredLines = lines.filter((line) => line.accountId && (line.debit || line.credit));
    if (!filteredLines.length) {
      setMessage("Add at least one debit and one credit line.");
      return;
    }
    if (!totals.balanced) {
      setMessage("Debits and credits must balance.");
      return;
    }

    const payload = {
      date: entryDate,
      memo: memo.trim() || undefined,
      reference: reference.trim() || undefined,
      lines: filteredLines.map((line) => ({
        accountId: line.accountId,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        memo: line.memo.trim() || undefined,
      })),
    };

    try {
      await createJournalEntry(payload);
      setSuccess("Journal entry created.");
      setDrawerOpen(false);
      loadEntries();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to create journal entry.");
    }
  };

  const handleReverse = async () => {
    if (!selected) return;
    if (!window.confirm("Reverse selected entry?")) return;
    setMessage("");
    setSuccess("");
    try {
      await reverseJournalEntry(selected.id);
      setSuccess("Reversal entry created.");
      loadEntries();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to reverse entry.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Journal Entries</h2>
          <p className="muted">Manual entries and automated postings from sales and expenses.</p>
        </div>
        <div className="button-row">
          <button type="button" onClick={openDrawer}>
            New Journal Entry
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
          Source
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">All</option>
            {sources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Search
          <input
            placeholder="Memo, reference, source id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
            <option value={25}>25</option>
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

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">Total: {meta.total || 0}</div>
            <div className="button-row">
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1 || loading}
              >
                Prev
              </button>
              <div className="muted">
                Page {meta.page || page} / {meta.pages || 1}
              </div>
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.min(prev + 1, meta.pages || 1))}
                disabled={page >= (meta.pages || 1) || loading}
              >
                Next
              </button>
            </div>
          </div>
          <div className="data-table">
            <div className="data-row data-header journal-row">
              <div>Date</div>
              <div>Source</div>
              <div>Reference</div>
              <div>Memo</div>
              <div>Debit</div>
              <div>Credit</div>
            </div>
            {loading ? (
              <div className="muted">Loading journal entries...</div>
            ) : rows.length ? (
              rows.map((row) => {
                const debit = row.lines?.reduce((sum, line) => sum + Number(line.debit || 0), 0) || 0;
                const credit = row.lines?.reduce((sum, line) => sum + Number(line.credit || 0), 0) || 0;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`data-row journal-row data-button ${row.id === selected?.id ? "data-selected" : ""}`}
                    onClick={() => setSelected(row)}
                  >
                    <div>{toDateInput(row.date) || "-"}</div>
                    <div>{row.source}</div>
                    <div>{row.reference || "-"}</div>
                    <div>{row.memo || "-"}</div>
                    <div>{debit.toFixed(2)}</div>
                    <div>{credit.toFixed(2)}</div>
                  </button>
                );
              })
            ) : (
              <div className="muted">No journal entries found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <h3>Entry Preview</h3>
          {selected ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Date</div>
                  <div className="stat-value">{toDateInput(selected.date) || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Source</div>
                  <div className="stat-value">{selected.source}</div>
                </div>
                <div>
                  <div className="stat-label">Reference</div>
                  <div className="stat-value">{selected.reference || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Memo</div>
                  <div className="stat-value">{selected.memo || "-"}</div>
                </div>
              </div>

              <div className="data-table">
                <div className="data-row data-header">
                  <div>Account</div>
                  <div>Debit</div>
                  <div>Credit</div>
                </div>
                {selected.lines?.map((line) => (
                  <div key={line.id} className="data-row">
                    <div>
                      {line.account?.code} - {line.account?.name}
                    </div>
                    <div>{Number(line.debit || 0).toFixed(2)}</div>
                    <div>{Number(line.credit || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <div className="button-row">
                <button type="button" className="button-outline" onClick={handleReverse}>
                  Reverse Entry
                </button>
              </div>
            </div>
          ) : (
            <div className="muted">Select a journal entry to preview.</div>
          )}
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create Journal Entry"
        footer={
          <div className="button-row">
            <button type="button" className="button-outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={handleSave}>
              Create Entry
            </button>
          </div>
        }
      >
        <div className="form form-wide">
          <label className="field">
            Date
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </label>
          <label className="field">
            Memo
            <input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <label className="field">
            Reference
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>

        <div className="divider" />

        <div className="stack">
          {lines.map((line, index) => (
            <div key={`line-${index}`} className="stock-line">
              <div className="stock-line-fields">
                <label className="field">
                  Account
                  <select
                    value={line.accountId}
                    onChange={(e) => updateLine(index, { accountId: e.target.value })}
                  >
                    <option value="">Select account</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Debit
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.debit}
                    onChange={(e) => updateLine(index, { debit: e.target.value, credit: "" })}
                  />
                </label>
                <label className="field">
                  Credit
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.credit}
                    onChange={(e) => updateLine(index, { credit: e.target.value, debit: "" })}
                  />
                </label>
                <label className="field">
                  Memo
                  <input
                    value={line.memo}
                    onChange={(e) => updateLine(index, { memo: e.target.value })}
                  />
                </label>
              </div>
              <div className="button-row">
                <button type="button" className="button-outline" onClick={() => removeLine(index)}>
                  Remove Line
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="button-outline" onClick={addLine}>
            Add Line
          </button>
          <div className="stat-grid">
            <div>
              <div className="stat-label">Total Debit</div>
              <div className="stat-value">{totals.debit}</div>
            </div>
            <div>
              <div className="stat-label">Total Credit</div>
              <div className="stat-value">{totals.credit}</div>
            </div>
            <div>
              <div className="stat-label">Balanced</div>
              <div className="stat-value">{totals.balanced ? "Yes" : "No"}</div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
