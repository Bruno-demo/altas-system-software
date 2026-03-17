// What this does: manages products with filters and a create drawer
import { useEffect, useMemo, useState } from "react";
import { createProduct, listProducts, updateProduct } from "../../api/inventory";
import Drawer from "../../components/Drawer";

const categories = ["Brake", "Chain", "Engine", "Electrical", "Motorbike"];

const emptyForm = {
  sku: "",
  partNumber: "",
  name: "",
  unit: "pcs",
  costPrice: "",
  sellPrice: "",
  minStock: "0",
  brand: "",
  category: "",
  modelCompatibility: "",
};

export default function Products() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [selected, setSelected] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadProducts = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listProducts({
        q: q.trim() || undefined,
        category: category || undefined,
        brand: brand.trim() || undefined,
      });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [q, category, brand]);

  const totalPages = Math.max(Math.ceil(rows.length / limit), 1);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * limit;
    return rows.slice(start, start + limit);
  }, [rows, page, limit]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput);
  };

  const openCreate = () => {
    setDrawerMode("create");
    setEditingId(null);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setDrawerMode("edit");
    setEditingId(selected.id);
    setForm({
      sku: selected.sku || "",
      partNumber: selected.partNumber || "",
      name: selected.name || "",
      unit: selected.unit || "pcs",
      costPrice: String(selected.costPrice || ""),
      sellPrice: String(selected.sellPrice || ""),
      minStock: String(selected.minStock ?? 0),
      brand: selected.brand || "",
      category: selected.category || "",
      modelCompatibility: selected.modelCompatibility || "",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setMessage("");
    if (!form.sku.trim() || !form.name.trim()) {
      setMessage("SKU and name are required.");
      return;
    }
    if (form.costPrice === "" || form.sellPrice === "") {
      setMessage("Cost price and sell price are required.");
      return;
    }
    const payload = {
      sku: form.sku.trim(),
      partNumber: form.partNumber.trim() || undefined,
      name: form.name.trim(),
      unit: form.unit.trim() || "pcs",
      costPrice: Number(form.costPrice),
      sellPrice: Number(form.sellPrice),
      minStock: Number(form.minStock || 0),
      brand: form.brand.trim() || undefined,
      category: form.category || undefined,
      modelCompatibility: form.modelCompatibility.trim() || undefined,
    };

    try {
      if (drawerMode === "edit" && editingId) {
        const res = await updateProduct(editingId, payload);
        setSelected(res.data || null);
      } else {
        await createProduct(payload);
      }
      setDrawerOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      setDrawerMode("create");
      loadProducts();
    } catch (err) {
      setMessage(
        err?.response?.data?.message ||
          (drawerMode === "edit" ? "Failed to update product." : "Failed to create product.")
      );
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Products</h2>
          <p className="muted">Manage SKU catalog and pricing.</p>
        </div>
        <button type="button" onClick={openCreate}>
          New Product
        </button>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid" onSubmit={handleSearch}>
        <label className="field">
          Search
          <input
            placeholder="SKU, name, part number"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </label>
        <label className="field">
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Brand
          <input
            placeholder="Brand"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setPage(1);
            }}
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
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <div className="filter-actions">
          <button type="submit">Apply Filters</button>
        </div>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">Items: {rows.length}</div>
            <button type="button" className="button-outline" onClick={loadProducts}>
              Refresh
            </button>
          </div>
          <div className="data-table">
            <div className="data-row data-header">
              <div>SKU</div>
              <div>Name</div>
              <div>Category</div>
              <div>Brand</div>
              <div>Sell</div>
            </div>
            {loading ? (
              <div className="muted">Loading products...</div>
            ) : pagedRows.length ? (
              pagedRows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`data-row data-button ${
                    row.id === selected?.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <div>{row.sku}</div>
                  <div>{row.name}</div>
                  <div>{row.category || "-"}</div>
                  <div>{row.brand || "-"}</div>
                  <div>{row.sellPrice}</div>
                </button>
              ))
            ) : (
              <div className="muted">No products found.</div>
            )}
          </div>
          <div className="table-toolbar">
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
        </section>

        <section className="card preview-panel">
          <h3>Product Preview</h3>
          {selected ? (
            <div className="stack">
              <div className="stat-grid">
                <div>
                  <div className="stat-label">SKU</div>
                  <div className="stat-value">{selected.sku}</div>
                </div>
                <div>
                  <div className="stat-label">Name</div>
                  <div className="stat-value">{selected.name}</div>
                </div>
                <div>
                  <div className="stat-label">Part Number</div>
                  <div className="stat-value">{selected.partNumber}</div>
                </div>
                <div>
                  <div className="stat-label">Unit</div>
                  <div className="stat-value">{selected.unit}</div>
                </div>
                <div>
                  <div className="stat-label">Cost</div>
                  <div className="stat-value">{selected.costPrice}</div>
                </div>
                <div>
                  <div className="stat-label">Sell</div>
                  <div className="stat-value">{selected.sellPrice}</div>
                </div>
                <div>
                  <div className="stat-label">Min Stock</div>
                  <div className="stat-value">{selected.minStock}</div>
                </div>
                <div>
                  <div className="stat-label">Brand</div>
                  <div className="stat-value">{selected.brand || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Category</div>
                  <div className="stat-value">{selected.category || "-"}</div>
                </div>
                <div>
                  <div className="stat-label">Model Compatibility</div>
                  <div className="stat-value">
                    {selected.modelCompatibility || "-"}
                  </div>
                </div>
              </div>
              <div className="button-row">
                <button type="button" className="button-outline" onClick={openEdit}>
                  Edit Product
                </button>
              </div>
            </div>
          ) : (
            <div className="muted">Select a product to preview.</div>
          )}
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === "edit" ? "Edit Product" : "Create Product"}
        footer={
          <div className="button-row">
            <button
              type="button"
              className="button-outline"
              onClick={() => setDrawerOpen(false)}
            >
              Cancel
            </button>
            <button type="button" onClick={handleSave}>
              {drawerMode === "edit" ? "Save Changes" : "Create"}
            </button>
          </div>
        }
      >
        <div className="form">
          <div className="field">
            <label>SKU</label>
            <input
              value={form.sku}
              onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Part Number</label>
            <input
              value={form.partNumber}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, partNumber: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Unit</label>
            <input
              value={form.unit}
              onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Cost Price</label>
            <input
              type="number"
              value={form.costPrice}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, costPrice: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Sell Price</label>
            <input
              type="number"
              value={form.sellPrice}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sellPrice: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Min Stock</label>
            <input
              type="number"
              value={form.minStock}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, minStock: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Brand</label>
            <input
              value={form.brand}
              onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Category</label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, category: e.target.value }))
              }
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Model Compatibility</label>
            <input
              value={form.modelCompatibility}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  modelCompatibility: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
