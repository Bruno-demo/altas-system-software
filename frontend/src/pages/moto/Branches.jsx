import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
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

export default function Branches() {
  const { user } = useAuth();
  const canWrite = ["SALESPERSON", "MANAGER", "CEO"].includes(user?.role);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

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

  const [settingsLoading, setSettingsLoading] = useState(false);

  const branchPages = meta?.pages || 1;
  const bikePages = detail?.bikes?.meta?.pages || 1;
  const salePages = detail?.sales?.meta?.pages || 1;

  const selectedSummary = useMemo(
    () => branches.find((row) => row.branchName === selectedBranch),
    [branches, selectedBranch]
  );

  const selectedLocationId =
    selectedSummary?.locationId || detail?.branch?.locationId || "";

  const loadBranches = async (preferredBranchName) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listBranches({ q: q.trim() || undefined, page, limit });
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
  }, [q, page, limit]);

  useEffect(() => {
    loadDetail();
  }, [selectedBranch, bikeQuery, bikePage, bikeLimit, salePage, saleLimit]);

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
            <button
              type="button"
              className="button-outline"
              onClick={loadDetail}
              disabled={!selectedBranch || detailLoading}
            >
              Refresh
            </button>
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
                            Report Sold
                          </Link>
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
                <h4>Recent Sales (Promotions)</h4>
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
                  <div>Count</div>
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
    </div>
  );
}
