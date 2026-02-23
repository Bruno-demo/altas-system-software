import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createBranchSale,
  getBranchDetail,
  listBranches,
  updateBranchSettings,
} from "../../api/motorbikes";
import {
  createLocation,
  updateLocation,
  deleteLocation,
} from "../../api/inventory";
import { useAuth } from "../../auth/AuthContext";
import Drawer from "../../components/Drawer";

function money(n) {
  const value = Number(n || 0);
  if (Number.isNaN(value)) return "0.00";
  return value.toFixed(2);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
}

function parseMinStock(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function emptySaleForm() {
  return {
    bikeId: "",
    branchName: "",
    chassisNumber: "",
    model: "",
    saleDate: todayDate(),
    sdcId: "",
    customerName: "",
    buyerTin: "",
    phoneNumber: "",
    quantity: "1",
    unitPrice: "",
    vat: "0",
    receiptType: "Sale",
    addToPromotion: false,
    plateNumber: "",
    delivered: false,
    stubPaid: false,
  };
}

const salePeriods = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

export default function Branches() {
  const { user } = useAuth();
  const canWrite = ["SALESPERSON", "MANAGER", "CEO"].includes(user?.role);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [salePeriod, setSalePeriod] = useState("all");
  const [saleFrom, setSaleFrom] = useState("");
  const [saleTo, setSaleTo] = useState("");

  const [branches, setBranches] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [bikeSearchInput, setBikeSearchInput] = useState("");
  const [bikeQuery, setBikeQuery] = useState("");
  const [bikePage, setBikePage] = useState(1);
  const [bikeLimit, setBikeLimit] = useState(10);

  const [salePage, setSalePage] = useState(1);
  const [saleLimit, setSaleLimit] = useState(10);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [locationForm, setLocationForm] = useState({
    name: "",
    minStock: "0",
  });
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationSuccess, setLocationSuccess] = useState("");
  const [saleSuccess, setSaleSuccess] = useState("");

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saleDrawerOpen, setSaleDrawerOpen] = useState(false);
  const [saleDrawerLoading, setSaleDrawerLoading] = useState(false);
  const [saleForm, setSaleForm] = useState(emptySaleForm());
  const [soldBikeIds, setSoldBikeIds] = useState(() => new Set());

  const branchPages = meta?.pages || 1;
  const bikePages = detail?.bikes?.meta?.pages || 1;
  const salePages = detail?.sales?.meta?.pages || 1;

  const selectedSummary = useMemo(
    () => branches.find((row) => row.branchName === selectedBranch),
    [branches, selectedBranch]
  );

  const selectedLocationId =
    selectedSummary?.locationId || detail?.branch?.locationId || "";
  const branchBikeOptions = detail?.bikes?.rows || [];

  const buildSalesFilterParams = () => ({
    salePeriod,
    ...(salePeriod === "custom"
      ? { saleFrom: saleFrom || undefined, saleTo: saleTo || undefined }
      : {}),
  });

  const loadBranches = async (preferredBranchName) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listBranches({
        q: q.trim() || undefined,
        page,
        limit,
        ...buildSalesFilterParams(),
      });
      const rows = res.data?.rows || [];
      setBranches(rows);
      setMeta(res.data?.meta || null);

      const preferred = preferredBranchName || selectedBranch;
      if (preferred && rows.some((row) => row.branchName === preferred)) {
        setSelectedBranch(preferred);
      } else {
        setSelectedBranch(rows[0]?.branchName || "");
      }
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load branches.");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async () => {
    if (!selectedBranch) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setMessage("");
    try {
      const res = await getBranchDetail({
        branch: selectedBranch,
        q: bikeQuery.trim() || undefined,
        bikePage,
        bikeLimit,
        salePage,
        saleLimit,
        ...buildSalesFilterParams(),
      });
      setDetail(res.data || null);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load branch details.");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [q, page, limit, salePeriod, saleFrom, saleTo]);

  useEffect(() => {
    loadDetail();
  }, [selectedBranch, bikeQuery, bikePage, bikeLimit, salePage, saleLimit, salePeriod, saleFrom, saleTo]);

  useEffect(() => {
    const minStockValue =
      selectedSummary?.minStock ?? detail?.branch?.minStock ?? 0;

    if (selectedLocationId) {
      setLocationForm({
        name: selectedSummary?.branchName || selectedBranch || "",
        minStock: String(minStockValue),
      });
      return;
    }

    if (selectedBranch) {
      setLocationForm({
        name: selectedBranch,
        minStock: String(minStockValue),
      });
      return;
    }

    setLocationForm({ name: "", minStock: "0" });
  }, [
    selectedBranch,
    selectedLocationId,
    selectedSummary?.branchName,
    selectedSummary?.minStock,
    detail?.branch?.minStock,
  ]);

  useEffect(() => {
    if (!locationSuccess) return;
    const timer = setTimeout(() => setLocationSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [locationSuccess]);

  useEffect(() => {
    if (!saleSuccess) return;
    const timer = setTimeout(() => setSaleSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [saleSuccess]);

  useEffect(() => {
    const bikes = detail?.bikes?.rows || [];
    const sales = detail?.sales?.rows || [];
    if (!bikes.length) {
      setSoldBikeIds(new Set());
      return;
    }

    const soldChassis = new Set(
      sales
        .map((row) => String(row?.chassisNumber || "").trim().toLowerCase())
        .filter((value) => value && value !== "-" && value !== "n/a")
    );

    const next = new Set();
    bikes.forEach((bike) => {
      const bikeKey = String(bike?.chassisNumber || bike?.sku || "")
        .trim()
        .toLowerCase();
      if (bikeKey && soldChassis.has(bikeKey)) {
        next.add(bike.id);
      }
    });
    setSoldBikeIds(next);
  }, [detail?.bikes?.rows, detail?.sales?.rows]);

  const applySearch = (event) => {
    event.preventDefault();
    setPage(1);
    setQ(qInput);
  };

  const applyBikeSearch = (event) => {
    event.preventDefault();
    setBikePage(1);
    setBikeQuery(bikeSearchInput);
  };

  const handleSelectBranch = (name) => {
    setSelectedBranch(name);
    setBikeQuery("");
    setBikeSearchInput("");
    setBikePage(1);
    setSalePage(1);
    setLocationMessage("");
    setLocationSuccess("");
    setSaleSuccess("");
  };

  const applyBranchSettings = async (event) => {
    event.preventDefault();
    setLocationMessage("");
    setLocationSuccess("");

    if (!selectedBranch) {
      setLocationMessage("Select a branch first.");
      return;
    }

    const parsedMinStock = parseMinStock(locationForm.minStock);
    if (parsedMinStock == null) {
      setLocationMessage("Min stock must be an integer >= 0.");
      return;
    }

    setSettingsLoading(true);
    try {
      await updateBranchSettings({
        branch: selectedBranch,
        minStock: parsedMinStock,
      });
      setLocationSuccess("Branch min stock applied to all motorbikes in this branch.");
      await Promise.all([loadDetail(), loadBranches(selectedBranch)]);
    } catch (err) {
      setLocationMessage(
        err?.response?.data?.message || "Failed to update branch settings."
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveLocation = async (event) => {
    event.preventDefault();
    setLocationMessage("");
    setLocationSuccess("");

    const name = String(locationForm.name || "").trim();
    if (!name) {
      setLocationMessage("Location name is required.");
      return;
    }

    const parsedMinStock = parseMinStock(locationForm.minStock);
    if (parsedMinStock == null) {
      setLocationMessage("Min stock must be an integer >= 0.");
      return;
    }

    setLocationLoading(true);
    try {
      if (selectedLocationId) {
        await updateLocation(selectedLocationId, {
          name,
          minStock: parsedMinStock,
        });
        setLocationSuccess("Location updated and synchronized.");
      } else {
        await createLocation({
          name,
          minStock: parsedMinStock,
        });
        setLocationSuccess("Location created and synchronized.");
      }

      setSelectedBranch(name);
      setPage(1);
      await loadBranches(name);
    } catch (err) {
      const backendMessage = err?.response?.data?.message;
      setLocationMessage(backendMessage || "Failed to save location.");
    } finally {
      setLocationLoading(false);
    }
  };

  const removeLocation = async () => {
    setLocationMessage("");
    setLocationSuccess("");

    if (!selectedLocationId) {
      setLocationMessage("Select a saved location to delete.");
      return;
    }

    if (
      !window.confirm(
        `Delete location "${selectedSummary?.branchName || selectedBranch}"?\nThis will unassign branch links from related motorbike records.`
      )
    ) {
      return;
    }

    setLocationLoading(true);
    try {
      await deleteLocation(selectedLocationId);
      setLocationSuccess("Location deleted. Branch links were synchronized.");
      setDetail(null);
      setSelectedBranch("");
      setLocationForm({ name: "", minStock: "0" });
      setPage(1);
      await loadBranches();
    } catch (err) {
      const backendMessage = err?.response?.data?.message;
      setLocationMessage(backendMessage || "Failed to delete location.");
    } finally {
      setLocationLoading(false);
    }
  };

  const resetLocationForm = () => {
    setLocationMessage("");
    setLocationSuccess("");
    setSelectedBranch("");
    setDetail(null);
    setLocationForm({ name: "", minStock: "0" });
  };

  const openSaleDrawer = (bikeRow = null) => {
    if (!selectedBranch) return;
    if (bikeRow?.id && soldBikeIds.has(bikeRow.id)) {
      setMessage("This bike is already sold.");
      return;
    }
    const sourceBike = bikeRow || branchBikeOptions[0] || null;
    setSaleForm({
      ...emptySaleForm(),
      bikeId: sourceBike?.id || "",
      branchName: selectedBranch,
      chassisNumber: sourceBike?.chassisNumber || sourceBike?.sku || "",
      model: sourceBike?.name || "",
      unitPrice:
        sourceBike?.sellPrice != null ? String(sourceBike.sellPrice) : "",
    });
    setSaleDrawerOpen(true);
  };

  const applyBikeToSale = (bikeId) => {
    const bike = branchBikeOptions.find((row) => row.id === bikeId);
    setSaleForm((prev) => ({
      ...prev,
      bikeId: bikeId || "",
      chassisNumber: bike?.chassisNumber || bike?.sku || "",
      model: bike?.name || "",
      unitPrice:
        bike?.sellPrice != null ? String(bike.sellPrice) : prev.unitPrice,
    }));
  };

  const submitBranchSale = async () => {
    setMessage("");
    setSaleSuccess("");

    if (!saleForm.branchName.trim()) {
      setMessage("Branch is required.");
      return;
    }
    if (!saleForm.model.trim()) {
      setMessage("Model is required.");
      return;
    }
    if (!saleForm.sdcId.trim()) {
      setMessage("SDC ID is required.");
      return;
    }

    const quantity = Number(saleForm.quantity || 0);
    const unitPrice = Number(saleForm.unitPrice || 0);
    const vat = Number(saleForm.vat || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage("Quantity must be greater than 0.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setMessage("Unit price must be greater than 0.");
      return;
    }
    if (!Number.isFinite(vat) || vat < 0) {
      setMessage("VAT must be 0 or greater.");
      return;
    }

    setSaleDrawerLoading(true);
    try {
      const payload = {
        branchName: saleForm.branchName.trim(),
        chassisNumber: saleForm.chassisNumber.trim() || undefined,
        model: saleForm.model.trim(),
        saleDate: saleForm.saleDate || undefined,
        sdcId: saleForm.sdcId.trim(),
        buyerName: saleForm.customerName.trim() || undefined,
        buyerTin: saleForm.buyerTin.trim() || undefined,
        phoneNumber: saleForm.phoneNumber.trim() || undefined,
        quantity,
        unitPrice,
        vat,
        receiptType: saleForm.receiptType || "Sale",
        addToPromotion: Boolean(saleForm.addToPromotion),
        plateNumber: saleForm.plateNumber.trim() || undefined,
        delivered: Boolean(saleForm.delivered),
        stubPaid: Boolean(saleForm.stubPaid),
      };

      const res = await createBranchSale(payload);
      setSaleDrawerOpen(false);
      if (saleForm.bikeId) {
        setSoldBikeIds((prev) => new Set([...prev, saleForm.bikeId]));
      }
      setSaleForm(emptySaleForm());
      setSaleSuccess(
        res.data?.promotion
          ? "Branch sale saved in SDC rows and synced to promotions."
          : "Branch sale saved in SDC rows."
      );
      await Promise.all([loadDetail(), loadBranches(selectedBranch)]);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to create branch sale.");
    } finally {
      setSaleDrawerLoading(false);
    }
  };

  return (
    <div className="page branches-page">
      <div className="page-header">
        <div>
          <h2>Branches</h2>
          <p className="muted">
            Monitor branch performance and manage synchronized branch location settings.
          </p>
        </div>
        <div className="button-row">
          <Link className="button-outline" to="/motorbikes">
            Motorbikes
          </Link>
          <Link className="button-outline" to="/motorbikes/promotions">
            Promotions
          </Link>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}
      {saleSuccess ? <div className="success">{saleSuccess}</div> : null}

      <form className="filters-grid" onSubmit={applySearch}>
        <label className="field">
          Branch search
          <input
            placeholder="Branch name"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </label>
        <label className="field">
          Sold period
          <select
            value={salePeriod}
            onChange={(e) => {
              setSalePeriod(e.target.value);
              setPage(1);
              setSalePage(1);
            }}
          >
            {salePeriods.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input
            type="date"
            value={saleFrom}
            onChange={(e) => {
              setSaleFrom(e.target.value);
              setPage(1);
              setSalePage(1);
            }}
            disabled={salePeriod !== "custom"}
          />
        </label>
        <label className="field">
          To
          <input
            type="date"
            value={saleTo}
            onChange={(e) => {
              setSaleTo(e.target.value);
              setPage(1);
              setSalePage(1);
            }}
            disabled={salePeriod !== "custom"}
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
            <div className="muted">
              {meta ? `Branches: ${meta.total}` : "Branches"}
            </div>
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
                Page {page} of {branchPages}
              </span>
              <button
                type="button"
                className="button-outline"
                onClick={() => setPage((prev) => Math.min(prev + 1, branchPages))}
                disabled={page >= branchPages || loading}
              >
                Next
              </button>
            </div>
          </div>

          <div className="data-table">
            <div className="data-row data-header branch-row">
              <div>Branch</div>
              <div>Bikes</div>
              <div>Sold</div>
              <div>Min Stock</div>
              <div>Last Sold</div>
            </div>
            {loading ? (
              <div className="muted">Loading branches...</div>
            ) : branches.length ? (
              branches.map((row) => (
                <button
                  type="button"
                  key={`${row.branchName}:${row.locationId || "none"}`}
                  className={`data-row data-button branch-row ${
                    row.branchName === selectedBranch ? "data-selected" : ""
                  }`}
                  onClick={() => handleSelectBranch(row.branchName)}
                >
                  <div>{row.branchName}</div>
                  <div>{row.bikesCount}</div>
                  <div>{row.soldCount}</div>
                  <div>{row.minStock ?? 0}</div>
                  <div>{formatDate(row.lastSoldAt)}</div>
                </button>
              ))
            ) : (
              <div className="muted">No branches found.</div>
            )}
          </div>
        </section>

        <section className="card preview-panel">
          <div className="table-toolbar">
            <h3>Branch Detail</h3>
            <div className="button-row">
              <button
                type="button"
                className="button-outline"
                onClick={() => openSaleDrawer()}
                disabled={!selectedBranch || !canWrite}
              >
                Create Branch Sale
              </button>
              <button
                type="button"
                className="button-outline"
                onClick={loadDetail}
                disabled={!selectedBranch || detailLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="table-toolbar">
            <h4>Location Management</h4>
            <div className="button-row">
              <button
                type="button"
                className="button-outline"
                onClick={resetLocationForm}
                disabled={locationLoading}
              >
                New Location
              </button>
              {selectedLocationId ? (
                <button
                  type="button"
                  className="button-outline"
                  onClick={removeLocation}
                  disabled={!canWrite || locationLoading}
                >
                  Delete Location
                </button>
              ) : null}
            </div>
          </div>

          {locationMessage ? <div className="alert">{locationMessage}</div> : null}
          {locationSuccess ? <div className="success">{locationSuccess}</div> : null}

          <form className="filters-grid" onSubmit={saveLocation}>
            <label className="field">
              Location name
              <input
                placeholder="e.g. Muhima"
                value={locationForm.name}
                onChange={(e) =>
                  setLocationForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Default min stock
              <input
                type="number"
                min="0"
                step="1"
                value={locationForm.minStock}
                onChange={(e) =>
                  setLocationForm((prev) => ({ ...prev, minStock: e.target.value }))
                }
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={!canWrite || locationLoading}>
                {locationLoading
                  ? "Saving..."
                  : selectedLocationId
                    ? "Update Location"
                    : "Create Location"}
              </button>
            </div>
          </form>

          <div className="muted">
            Saving location settings synchronizes branch labels and motorbike min stock.
          </div>

          <div className="divider" />

          {selectedBranch ? (
            <>
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Branch</div>
                  <div className="stat-value">{selectedBranch}</div>
                </div>
                <div>
                  <div className="stat-label">Location record</div>
                  <div className="stat-value">{selectedLocationId ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="stat-label">Bikes</div>
                  <div className="stat-value">
                    {detail?.branch?.bikesCount ?? selectedSummary?.bikesCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Sold</div>
                  <div className="stat-value">
                    {detail?.branch?.soldCount ?? selectedSummary?.soldCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Last Sold</div>
                  <div className="stat-value">
                    {formatDate(
                      detail?.branch?.lastSoldAt ?? selectedSummary?.lastSoldAt
                    )}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Total Value</div>
                  <div className="stat-value">{money(selectedSummary?.bikesValue)}</div>
                </div>
                <div>
                  <div className="stat-label">Min Stock</div>
                  <div className="stat-value">
                    {detail?.branch?.minStock ?? selectedSummary?.minStock ?? 0}
                  </div>
                </div>
              </div>

              <div className="divider" />

              <div className="table-toolbar">
                <h4>Apply Min Stock to Existing Bikes</h4>
              </div>
              <form className="filters-grid" onSubmit={applyBranchSettings}>
                <label className="field">
                  Branch min stock
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={locationForm.minStock}
                    onChange={(e) =>
                      setLocationForm((prev) => ({ ...prev, minStock: e.target.value }))
                    }
                  />
                </label>
                <div className="filter-actions">
                  <button
                    type="submit"
                    disabled={!canWrite || settingsLoading || !selectedBranch}
                  >
                    {settingsLoading ? "Applying..." : "Apply to Branch Bikes"}
                  </button>
                </div>
              </form>

              <div className="divider" />

              <div className="table-toolbar">
                <h4>Motorbikes in Branch</h4>
                <form className="filter-row" onSubmit={applyBikeSearch}>
                  <input
                    placeholder="Search chassis, model, brand"
                    value={bikeSearchInput}
                    onChange={(e) => setBikeSearchInput(e.target.value)}
                  />
                  <button type="submit">Search</button>
                </form>
              </div>

              <div className="data-table">
                <div className="data-row data-header branch-bike-row">
                  <div>Chassis</div>
                  <div>Model</div>
                  <div>Brand</div>
                  <div>Year</div>
                  <div>Action</div>
                </div>
                {detailLoading ? (
                  <div className="muted">Loading motorbikes...</div>
                ) : detail?.bikes?.rows?.length ? (
                  detail.bikes.rows.map((row) => (
                    <div key={row.id} className="data-row branch-bike-row">
                      <div>{row.chassisNumber || row.sku}</div>
                      <div>{row.name}</div>
                      <div>{row.brand || "-"}</div>
                      <div>{row.modelYear || "-"}</div>
                      <div className="button-row">
                        {canWrite ? (
                          <>
                            {!soldBikeIds.has(row.id) ? (
                              <button
                                type="button"
                                className="button-outline"
                                onClick={() => openSaleDrawer(row)}
                              >
                                Create Sale
                              </button>
                            ) : null}
                            <Link
                              className="button-outline"
                              to={`/motorbikes/promotions?chassis=${encodeURIComponent(
                                row.chassisNumber || row.sku || ""
                              )}&model=${encodeURIComponent(
                                row.name || ""
                              )}&branch=${encodeURIComponent(
                                row.branchName || selectedBranch || ""
                              )}`}
                            >
                              Add to Promotion
                            </Link>
                          </>
                        ) : (
                          <span className="muted">View only</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted">No motorbikes found.</div>
                )}
              </div>

              <div className="table-toolbar">
                <div className="pagination">
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => setBikePage((prev) => Math.max(prev - 1, 1))}
                    disabled={bikePage <= 1}
                  >
                    Prev
                  </button>
                  <span>
                    Page {bikePage} of {bikePages}
                  </span>
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => setBikePage((prev) => Math.min(prev + 1, bikePages))}
                    disabled={bikePage >= bikePages}
                  >
                    Next
                  </button>
                </div>
                <label className="field">
                  Row limit
                  <select
                    value={bikeLimit}
                    onChange={(e) => {
                      setBikeLimit(Number(e.target.value));
                      setBikePage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </label>
              </div>

              <div className="divider" />

              <div className="table-toolbar">
                <h4>Recent Branch Sales</h4>
                <div className="muted">
                  Range: {detail?.salesRange?.from || "-"} to {detail?.salesRange?.to || "-"}
                </div>
                <label className="field">
                  Row limit
                  <select
                    value={saleLimit}
                    onChange={(e) => {
                      setSaleLimit(Number(e.target.value));
                      setSalePage(1);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </label>
              </div>

              <div className="data-table">
                <div className="data-row data-header branch-sale-row">
                  <div>SDC ID</div>
                  <div>Date</div>
                  <div>Customer</div>
                  <div>Chassis</div>
                  <div>Model</div>
                </div>
                {detailLoading ? (
                  <div className="muted">Loading sales...</div>
                ) : detail?.sales?.rows?.length ? (
                  detail.sales.rows.map((row) => (
                    <div key={row.id} className="data-row branch-sale-row">
                      <div>{row.countingNumber || "-"}</div>
                      <div>{formatDate(row.date)}</div>
                      <div>{row.customerName || "-"}</div>
                      <div>{row.chassisNumber || "-"}</div>
                      <div>{row.model || "-"}</div>
                    </div>
                  ))
                ) : (
                  <div className="muted">No sales recorded.</div>
                )}
              </div>

              <div className="table-toolbar">
                <div className="pagination">
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => setSalePage((prev) => Math.max(prev - 1, 1))}
                    disabled={salePage <= 1}
                  >
                    Prev
                  </button>
                  <span>
                    Page {salePage} of {salePages}
                  </span>
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => setSalePage((prev) => Math.min(prev + 1, salePages))}
                    disabled={salePage >= salePages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="muted">Select a branch to view full branch details.</div>
          )}
        </section>
      </div>

      <Drawer
        open={saleDrawerOpen}
        onClose={() => setSaleDrawerOpen(false)}
        title="Create Branch Sale"
        footer={
          <div className="button-row">
            <button
              type="button"
              className="button-outline"
              onClick={() => setSaleDrawerOpen(false)}
              disabled={saleDrawerLoading}
            >
              Cancel
            </button>
            <button type="button" onClick={submitBranchSale} disabled={saleDrawerLoading}>
              {saleDrawerLoading ? "Saving..." : "Save Sale"}
            </button>
          </div>
        }
      >
        <div className="form">
          {branchBikeOptions.length ? (
            <label className="field">
              Pick branch bike
              <select
                value={saleForm.bikeId}
                onChange={(e) => applyBikeToSale(e.target.value)}
              >
                <option value="">Manual</option>
                {branchBikeOptions.map((bike) => (
                  <option key={bike.id} value={bike.id}>
                    {bike.name} | {bike.chassisNumber || bike.sku}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            Branch
            <input value={saleForm.branchName} readOnly />
          </label>
          <label className="field">
            Chassis number (optional)
            <input
              value={saleForm.chassisNumber}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, chassisNumber: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Model
            <input
              value={saleForm.model}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, model: e.target.value }))
              }
            />
          </label>
          <label className="field">
            SDC ID (required)
            <input
              value={saleForm.sdcId}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, sdcId: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Sale date
            <input
              type="date"
              value={saleForm.saleDate}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, saleDate: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Customer name
            <input
              value={saleForm.customerName}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, customerName: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Buyer TIN
            <input
              value={saleForm.buyerTin}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, buyerTin: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Phone number
            <input
              value={saleForm.phoneNumber}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, phoneNumber: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Quantity
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={saleForm.quantity}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, quantity: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Unit price
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={saleForm.unitPrice}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, unitPrice: e.target.value }))
              }
            />
          </label>
          <label className="field">
            VAT
            <input
              type="number"
              min="0"
              step="0.01"
              value={saleForm.vat}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, vat: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Receipt type
            <select
              value={saleForm.receiptType}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, receiptType: e.target.value }))
              }
            >
              <option value="Sale">Sale</option>
              <option value="Refund after Sale">Refund after Sale</option>
              <option value="Exchange">Exchange</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={saleForm.addToPromotion}
              onChange={(e) =>
                setSaleForm((prev) => ({ ...prev, addToPromotion: e.target.checked }))
              }
            />
            <span>Also add to Promotions</span>
          </label>
          {saleForm.addToPromotion ? (
            <>
              <label className="field">
                Plate number
                <input
                  value={saleForm.plateNumber}
                  onChange={(e) =>
                    setSaleForm((prev) => ({ ...prev, plateNumber: e.target.value }))
                  }
                />
              </label>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={saleForm.delivered}
                  onChange={(e) =>
                    setSaleForm((prev) => ({ ...prev, delivered: e.target.checked }))
                  }
                />
                <span>Delivered</span>
              </label>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={saleForm.stubPaid}
                  onChange={(e) =>
                    setSaleForm((prev) => ({ ...prev, stubPaid: e.target.checked }))
                  }
                />
                <span>Stub paid</span>
              </label>
            </>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
