import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createProduct, listProducts, updateProduct } from "../../api/inventory";
import Drawer from "../../components/Drawer";
import { useAuth } from "../../auth/AuthContext";
import { listLocations } from "../../api/inventory";

const emptyForm = {
  chassisNumber: "",
  manufacturer: "",
  model: "",
  modelYear: "",
  weightKg: "",
  color: "",
  branchName: "",
  costPrice: "",
  sellPrice: "",
};

export default function Motorbikes() {
  const { user } = useAuth();
  const canWrite = ["SALESPERSON", "MANAGER", "CEO"].includes(user?.role);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");

  const [rows, setRows] = useState([]);
  const [locationBranches, setLocationBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [selected, setSelected] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadMotorbikes = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listProducts({
        q: q.trim() || undefined,
        brand: brand.trim() || undefined,
        category: "Motorbike",
      });
      setRows(res.data || []);
      if (selected && !(res.data || []).some((row) => row.id === selected.id)) {
        setSelected(null);
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load motorbikes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMotorbikes();
  }, [q, brand]);

  useEffect(() => {
    let mounted = true;
    listLocations()
      .then((res) => {
        if (!mounted) return;
        setLocationBranches(res.data || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setMessage(err?.response?.data?.message || "Failed to load branches.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const branchOptions = useMemo(() => {
    const set = new Set(
      (locationBranches || [])
        .map((row) => row?.name)
        .filter(
          (name) =>
            Boolean(name) &&
            String(name).trim().toUpperCase() !== "MOTORBIKE-SALES"
        )
    );
    if (selected?.branchName) set.add(selected.branchName);
    if (form.branchName) set.add(form.branchName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [locationBranches, selected?.branchName, form.branchName]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleSearch = (event) => {
    event.preventDefault();
    setQ(qInput);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      branchName: branchOptions[0] || "",
    });
    setDrawerOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditing(selected);
    setForm({
      chassisNumber: selected.chassisNumber || selected.sku || "",
      manufacturer: selected.brand || "",
      model: selected.name || "",
      modelYear: selected.modelYear != null ? String(selected.modelYear) : "",
      weightKg: selected.weightKg != null ? String(selected.weightKg) : "",
      color: selected.color || "",
      branchName: selected.branchName || "",
      costPrice: selected.costPrice || "",
      sellPrice: selected.sellPrice || "",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    setMessage("");
    setSuccess("");
    if (!form.chassisNumber.trim()) {
      setMessage("Chassis number is required.");
      return;
    }
    if (!form.model.trim()) {
      setMessage("Model is required.");
      return;
    }
    if (user?.role === "SALESPERSON" && !form.branchName.trim()) {
      setMessage("Branch is required for motorbikes created by salesperson.");
      return;
    }
    if (form.costPrice === "" || form.sellPrice === "") {
      setMessage("Cost price and sell price are required.");
      return;
    }

    const payload = {
      sku: form.chassisNumber.trim(),
      chassisNumber: form.chassisNumber.trim(),
      name: form.model.trim(),
      brand: form.manufacturer.trim() || undefined,
      unit: "unit",
      costPrice: Number(form.costPrice),
      sellPrice: Number(form.sellPrice),
      category: "Motorbike",
      modelYear: form.modelYear.trim() ? Number(form.modelYear) : undefined,
      weightKg: form.weightKg.trim() ? Number(form.weightKg) : undefined,
      color: form.color.trim() || undefined,
      branchName: form.branchName.trim() || undefined,
    };

    try {
      if (editing) {
        await updateProduct(editing.id, payload);
        setSuccess("Motorbike updated.");
      } else {
        await createProduct(payload);
        setSuccess("Motorbike created.");
      }
      setDrawerOpen(false);
      setForm(emptyForm);
      setEditing(null);
      loadMotorbikes();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Save failed.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Motorbikes</h2>
          <p className="muted">Manage motorbike models (SPIRO, BAJAJ, DISCOVER, etc.).</p>
        </div>
        <div className="button-row">
          <Link className="button-outline" to="/motorbikes/branches">
            Branches
          </Link>
          <Link className="button-outline" to="/motorbikes/promotions">
            Promotions
          </Link>
          {canWrite ? (
            <button type="button" onClick={openCreate}>
              New Motorbike
            </button>
          ) : null}
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <form className="filters-grid" onSubmit={handleSearch}>
        <label className="field">
          Search
          <input
            placeholder="Chassis, model, manufacturer, branch"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </label>
        <label className="field">
          Manufacturer
          <input
            placeholder="Manufacturer"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </label>
        <div className="filter-actions">
          <button type="submit">Apply Filters</button>
        </div>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="table-toolbar">
            <div className="muted">Items: {rows.length}</div>
            <button type="button" className="button-outline" onClick={loadMotorbikes}>
              Refresh
            </button>
          </div>
          <div className="data-table">
            <div className="data-row data-header">
              <div>Chassis</div>
              <div>Model</div>
              <div>Manufacturer</div>
              <div>Year</div>
              <div>Branch</div>
            </div>
            {loading ? (
              <div className="muted">Loading motorbikes...</div>
            ) : rows.length ? (
              rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`data-row data-button ${
                    row.id === selected?.id ? "data-selected" : ""
                  }`}
                  onClick={() => setSelected(row)}
                >
                  <div>{row.chassisNumber || row.sku}</div>
                  <div>{row.name}</div>
                  <div>{row.brand || "-"}</div>
                  <div>{row.modelYear || "-"}</div>
                  <div>{row.branchName || "-"}</div>
                </button>
              ))
            ) : (
              <div className="muted">No motorbikes found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <div className="table-toolbar">
            <h3>Motorbike Preview</h3>
            {canWrite && selected ? (
              <div className="button-row">
                <button type="button" className="button-outline" onClick={openEdit}>
                  Edit
                </button>
                <Link
                  className="button-outline"
                  to={`/motorbikes/promotions?chassis=${encodeURIComponent(
                    selected.chassisNumber || selected.sku || ""
                  )}&model=${encodeURIComponent(
                    selected.name || ""
                  )}&branch=${encodeURIComponent(selected.branchName || "")}`}
                >
                  Report Sold
                </Link>
              </div>
            ) : null}
          </div>

          {selected ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Chassis</div>
                <div className="stat-value">
                  {selected.chassisNumber || selected.sku}
                </div>
              </div>
              <div>
                <div className="stat-label">Model</div>
                <div className="stat-value">{selected.name}</div>
              </div>
              <div>
                <div className="stat-label">Manufacturer</div>
                <div className="stat-value">{selected.brand || "-"}</div>
              </div>
              <div>
                <div className="stat-label">Year</div>
                <div className="stat-value">{selected.modelYear || "-"}</div>
              </div>
              <div>
                <div className="stat-label">Weight (kg)</div>
                <div className="stat-value">{selected.weightKg || "-"}</div>
              </div>
              <div>
                <div className="stat-label">Color</div>
                <div className="stat-value">{selected.color || "-"}</div>
              </div>
              <div>
                <div className="stat-label">Branch</div>
                <div className="stat-value">{selected.branchName || "-"}</div>
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
            </div>
          ) : (
            <div className="muted">Select a motorbike to preview.</div>
          )}
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Motorbike" : "Create Motorbike"}
        footer={
          <div className="button-row">
            <button type="button" className="button-outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={handleSave}>
              {editing ? "Save Changes" : "Create Motorbike"}
            </button>
          </div>
        }
      >
        <div className="form">
          <label className="field">
            Chassis number
            <input
              value={form.chassisNumber}
              onChange={(e) => setForm((p) => ({ ...p, chassisNumber: e.target.value }))}
            />
          </label>
          <label className="field">
            Manufacturer
            <input
              value={form.manufacturer}
              onChange={(e) => setForm((p) => ({ ...p, manufacturer: e.target.value }))}
            />
          </label>
          <label className="field">
            Model
            <input
              value={form.model}
              onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
            />
          </label>
          <label className="field">
            Year
            <input
              type="number"
              min="1950"
              max="2100"
              value={form.modelYear}
              onChange={(e) => setForm((p) => ({ ...p, modelYear: e.target.value }))}
            />
          </label>
          <label className="field">
            Cost price
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.costPrice}
              onChange={(e) => setForm((p) => ({ ...p, costPrice: e.target.value }))}
            />
          </label>
          <label className="field">
            Sell price
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.sellPrice}
              onChange={(e) => setForm((p) => ({ ...p, sellPrice: e.target.value }))}
            />
          </label>
          <label className="field">
            Weight (kg)
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.weightKg}
              onChange={(e) => setForm((p) => ({ ...p, weightKg: e.target.value }))}
            />
          </label>
          <label className="field">
            Color
            <input
              value={form.color}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
            />
          </label>
          <label className="field">
            Branch
            <select
              value={form.branchName}
              onChange={(e) => setForm((p) => ({ ...p, branchName: e.target.value }))}
            >
              <option value="">{branchOptions.length ? "Select branch" : "No branch found"}</option>
              {branchOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <small className="muted">
              Branches come from Location records and are managed on stock side.
            </small>
          </label>
        </div>
      </Drawer>
    </div>
  );
}
