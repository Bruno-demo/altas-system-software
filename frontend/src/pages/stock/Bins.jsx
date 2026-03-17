// What this does: lists bins and lets users create new bin codes
import { useEffect, useMemo, useState } from "react";
import { createBin, createLocation, listBins, listLocations } from "../../api/inventory";
import Drawer from "../../components/Drawer";

const emptyForm = {
  code: "",
  description: "",
  locationId: "",
};

export default function Bins() {
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [locationName, setLocationName] = useState("");

  const loadLocations = async () => {
    try {
      const res = await listLocations();
      setLocations(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load locations.");
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const loadBins = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await listBins(locationId ? { locationId } : undefined);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to load bins.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBins();
  }, [locationId]);

  const totalPages = Math.max(Math.ceil(rows.length / limit), 1);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * limit;
    return rows.slice(start, start + limit);
  }, [rows, page, limit]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleCreate = async () => {
    setMessage("");
    try {
      await createBin({
        code: form.code.trim(),
        description: form.description.trim() || undefined,
        locationId: form.locationId,
      });
      setDrawerOpen(false);
      setForm(emptyForm);
      loadBins();
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to create bin.");
    }
  };

  const handleCreateLocation = async () => {
    setMessage("");
    try {
      const res = await createLocation({ name: locationName.trim() });
      setLocationDrawerOpen(false);
      setLocationName("");
      await loadLocations();
      if (!locationId) setLocationId(res.data?.id || "");
    } catch (err) {
      setMessage(err?.response?.data?.message || "Failed to create location.");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Bins</h2>
          <p className="muted">Organize storage shelves by location.</p>
        </div>
        <div className="button-row">
          <button type="button" className="button-outline" onClick={() => setLocationDrawerOpen(true)}>
            New Location
          </button>
          <button type="button" onClick={() => setDrawerOpen(true)}>
            New Bin
          </button>
        </div>
      </div>

      {message ? <div className="alert">{message}</div> : null}

      <form className="filters-grid">
        <label className="field">
          Location
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
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
          <button type="button" className="button-outline" onClick={loadBins}>
            Refresh
          </button>
        </div>
      </form>

      <div className="split-view">
        <section className="card list-panel">
          <div className="data-table">
            <div className="data-row data-header">
              <div>Code</div>
              <div>Location</div>
              <div>Description</div>
            </div>
            {loading ? (
              <div className="muted">Loading bins...</div>
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
                  <div>{row.code}</div>
                  <div>{row.location?.name || "-"}</div>
                  <div>{row.description || "-"}</div>
                </button>
              ))
            ) : (
              <div className="muted">No bins found.</div>
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
          <h3>Bin Preview</h3>
          {selected ? (
            <div className="stat-grid">
              <div>
                <div className="stat-label">Code</div>
                <div className="stat-value">{selected.code}</div>
              </div>
              <div>
                <div className="stat-label">Location</div>
                <div className="stat-value">{selected.location?.name}</div>
              </div>
              <div>
                <div className="stat-label">Description</div>
                <div className="stat-value">{selected.description || "-"}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Select a bin to preview.</div>
          )}
        </section>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create Bin"
        footer={
          <div className="button-row">
            <button type="button" className="button-outline" onClick={() => setDrawerOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={handleCreate}>
              Create
            </button>
          </div>
        }
      >
        <div className="form">
          <div className="field">
            <label>Code</label>
            <input
              value={form.code}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, code: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Location</label>
            <select
              value={form.locationId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, locationId: e.target.value }))
              }
            >
              <option value="">Select location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>
        </div>
      </Drawer>

      <Drawer
        open={locationDrawerOpen}
        onClose={() => setLocationDrawerOpen(false)}
        title="Create Location"
        footer={
          <div className="button-row">
            <button type="button" className="button-outline" onClick={() => setLocationDrawerOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={handleCreateLocation}>
              Create
            </button>
          </div>
        }
      >
        <div className="form">
          <div className="field">
            <label>Name</label>
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
