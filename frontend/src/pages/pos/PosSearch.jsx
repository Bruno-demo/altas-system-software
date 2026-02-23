// What this does: lets cashier search products and immediately see availability + top bin suggestions
import { useMemo, useState } from "react";
import { api } from "../../api/http";

export default function PosSearch() {
  const [qInput, setQInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1, limit: 10 });

  const totalPages = Math.max(Number(meta?.pages || 1), 1);

  const runSearch = async ({ query = activeQuery, nextPage = page, nextLimit = limit } = {}) => {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) {
      setMsg("Type at least 2 characters to search.");
      setRows([]);
      setMeta({ total: 0, page: 1, pages: 1, limit: nextLimit });
      return;
    }

    setMsg("");
    try {
      const res = await api.get("/api/products/search", {
        params: {
          q: cleanQuery,
          page: nextPage,
          limit: nextLimit,
        },
      });
      const items = Array.isArray(res.data?.rows)
        ? res.data.rows
        : Array.isArray(res.data?.items)
          ? res.data.items
          : [];
      const apiMeta = res.data?.meta || {
        total: items.length,
        page: nextPage,
        pages: 1,
        limit: nextLimit,
      };

      setRows(items);
      setActiveQuery(cleanQuery);
      setPage(Number(apiMeta.page || nextPage));
      setMeta({
        total: Number(apiMeta.total || items.length),
        page: Number(apiMeta.page || nextPage),
        pages: Math.max(Number(apiMeta.pages || 1), 1),
        limit: Number(apiMeta.limit || nextLimit),
      });
    } catch (err) {
      setMsg(err?.response?.data?.message || "Search failed");
    }
  };

  const search = async (event) => {
    event.preventDefault();
    await runSearch({ query: qInput, nextPage: 1, nextLimit: limit });
  };

  const resultCountLabel = useMemo(() => {
    if (!activeQuery) return "Search name, part number, brand, or category.";
    return `Results: ${meta.total}`;
  }, [activeQuery, meta.total]);

  return (
    <div className="page pos-search-page">
      <h2>POS Product Search</h2>
      <p className="muted">{resultCountLabel}</p>

      {msg ? <div className="alert pos-search-alert">{msg}</div> : null}

      <form onSubmit={search} className="pos-search-form">
        <input
          className="pos-search-input"
          placeholder="Search name / partNumber / brand / category..."
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      <div className="table-toolbar">
        <label className="field">
          Row limit
          <select
            value={limit}
            onChange={(e) => {
              const nextLimit = Number(e.target.value);
              setLimit(nextLimit);
              if (activeQuery) {
                runSearch({ query: activeQuery, nextPage: 1, nextLimit });
              }
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
        <div className="pagination">
          <button
            type="button"
            className="button-outline"
            disabled={page <= 1 || !activeQuery}
            onClick={() =>
              runSearch({ query: activeQuery, nextPage: Math.max(page - 1, 1), nextLimit: limit })
            }
          >
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="button-outline"
            disabled={page >= totalPages || !activeQuery}
            onClick={() =>
              runSearch({
                query: activeQuery,
                nextPage: Math.min(page + 1, totalPages),
                nextLimit: limit,
              })
            }
          >
            Next
          </button>
        </div>
      </div>

      <div className="pos-search-results">
        {rows.map((r, index) => {
          const product = r.product || {};
          const isMotorbike =
            product.category === "Motorbike" || Boolean(product.chassisNumber);
          const availability = r.availability || {};
          const totalQty =
            availability.totalQty ??
            r.totalQuantity ??
            availability.totalQuantity ??
            0;
          const status = isMotorbike
            ? "Available"
            : availability.status || (r.available ? "Available" : "Out of stock");
          const qtyLabel = isMotorbike ? "N/A" : totalQty;

          const rawBins = Array.isArray(r.topBins)
            ? r.topBins
            : r.topBinSuggestion
              ? [r.topBinSuggestion]
              : Array.isArray(r.pickFrom)
                ? r.pickFrom
                : [];

          const topBins = rawBins.map((b) => ({
            locationName: b.location?.name || b.locationName || "-",
            binCode: b.bin?.code || b.binCode || "-",
            qty: b.qty ?? b.quantity ?? 0,
          }));

          return (
            <div
              key={product.id || `${product.sku || "row"}-${index}`}
              className="card pos-search-item"
            >
              <div className="pos-search-row">
                <div>
                  <div className="pos-search-title">{product.name || "-"}</div>
                  <div className="muted pos-search-meta">
                    SKU: {product.sku || "-"} - Part:{" "}
                    {product.partNumber || "-"} - Brand:{" "}
                    {product.brand || "-"} - Cat: {product.category || "-"}
                  </div>
                </div>

                <div className="pos-search-qty">
                  <div className="pos-search-qty-value">{qtyLabel} pcs</div>
                  <div className="muted pos-search-qty-status">{status}</div>
                </div>
              </div>

              <div className="pos-search-suggestions">
                <div className="pos-search-suggestions-title">
                  Top bin suggestions
                </div>
                {isMotorbike ? (
                  <div className="muted">No bin needed for motorbikes.</div>
                ) : topBins.length ? (
                  <ul className="pos-search-suggestions-list">
                    {topBins.map((b, idx) => (
                      <li key={`${b.binCode}-${idx}`}>
                        {b.locationName} - BIN {b.binCode} - Qty {b.qty}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="muted">No bin record</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
