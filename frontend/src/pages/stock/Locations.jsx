// What this does: manages the branch-location-bin hierarchy
import { useEffect, useState } from "react";
import {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  listBins,
  createBin,
  updateBin,
  deleteBin,
} from "../../api/inventory";

export default function Locations() {
  const [branches, setBranches] = useState([]);
  const [locations, setLocations] = useState([]);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Branch form
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState({ name: "" });

  // Location form
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationForm, setLocationForm] = useState({ name: "", branchId: "" });

  // Bin form
  const [showBinForm, setShowBinForm] = useState(false);
  const [editingBin, setEditingBin] = useState(null);
  const [binForm, setBinForm] = useState({ code: "", description: "", locationId: "" });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [branchesRes, locationsRes, binsRes] = await Promise.all([
        listBranches(),
        listLocations(),
        listBins(),
      ]);
      setBranches(branchesRes.data || []);
      setLocations(locationsRes.data || []);
      setBins(binsRes.data || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // Branch operations
  const handleBranchSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await updateBranch(editingBranch.id, branchForm);
        setMsg("Branch updated successfully");
      } else {
        await createBranch(branchForm);
        setMsg("Branch created successfully");
      }
      setShowBranchForm(false);
      setEditingBranch(null);
      setBranchForm({ name: "" });
      loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Operation failed");
    }
  };

  const handleEditBranch = (branch) => {
    setEditingBranch(branch);
    setBranchForm({ name: branch.name });
    setShowBranchForm(true);
  };

  const handleDeleteBranch = async (branch) => {
    if (!confirm(`Delete branch "${branch.name}" and all its locations/bins?`)) return;
    try {
      await deleteBranch(branch.id);
      setMsg("Branch deleted successfully");
      loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Delete failed");
    }
  };

  // Location operations
  const handleLocationSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLocation) {
        await updateLocation(editingLocation.id, locationForm);
        setMsg("Location updated successfully");
      } else {
        await createLocation(locationForm);
        setMsg("Location created successfully");
      }
      setShowLocationForm(false);
      setEditingLocation(null);
      setLocationForm({ name: "", branchId: "" });
      loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Operation failed");
    }
  };

  const handleEditLocation = (location) => {
    setEditingLocation(location);
    setLocationForm({ name: location.name, branchId: location.branchId });
    setShowLocationForm(true);
  };

  const handleDeleteLocation = async (location) => {
    if (!confirm(`Delete location "${location.name}"?`)) return;
    try {
      await deleteLocation(location.id);
      setMsg("Location deleted successfully");
      loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Delete failed");
    }
  };

  // Bin operations
  const handleBinSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBin) {
        await updateBin(editingBin.id, binForm);
        setMsg("Bin updated successfully");
      } else {
        await createBin(binForm);
        setMsg("Bin created successfully");
      }
      setShowBinForm(false);
      setEditingBin(null);
      setBinForm({ code: "", description: "", locationId: "" });
      loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Operation failed");
    }
  };

  const handleEditBin = (bin) => {
    setEditingBin(bin);
    setBinForm({ code: bin.code, description: bin.description || "", locationId: bin.locationId });
    setShowBinForm(true);
  };

  const handleDeleteBin = async (bin) => {
    if (!confirm(`Delete bin "${bin.code}"?`)) return;
    try {
      await deleteBin(bin.id);
      setMsg("Bin deleted successfully");
      loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Delete failed");
    }
  };

  if (loading) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>Branch-Location-Bin Management</h1>

      {msg && (
        <div className="alert" style={{ marginBottom: "1rem" }}>
          {msg}
        </div>
      )}

      {/* Branches Section */}
      <section className="card" style={{ marginBottom: "2rem" }}>
        <div className="card-header">
          <h2>Branches</h2>
          <button
            onClick={() => {
              setShowBranchForm(true);
              setEditingBranch(null);
              setBranchForm({ name: "" });
            }}
          >
            Add Branch
          </button>
        </div>

        {showBranchForm && (
          <form onSubmit={handleBranchSubmit} style={{ marginBottom: "1rem", padding: "1rem", border: "1px solid #ddd" }}>
            <h3>{editingBranch ? "Edit Branch" : "Add Branch"}</h3>
            <div className="field">
              <label>Name</label>
              <input
                type="text"
                value={branchForm.name}
                onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                required
              />
            </div>
            <div className="button-row">
              <button type="submit">{editingBranch ? "Update" : "Create"}</button>
              <button
                type="button"
                onClick={() => {
                  setShowBranchForm(false);
                  setEditingBranch(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Branch Name</th>
                <th>Locations</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id}>
                  <td>{branch.name}</td>
                  <td>{branch._count?.locations || 0}</td>
                  <td>
                    <button onClick={() => handleEditBranch(branch)}>Edit</button>
                    <button onClick={() => handleDeleteBranch(branch)} className="danger">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Locations Section */}
      <section className="card" style={{ marginBottom: "2rem" }}>
        <div className="card-header">
          <h2>Locations</h2>
          <button
            onClick={() => {
              setShowLocationForm(true);
              setEditingLocation(null);
              setLocationForm({ name: "", branchId: "" });
            }}
          >
            Add Location
          </button>
        </div>

        {showLocationForm && (
          <form onSubmit={handleLocationSubmit} style={{ marginBottom: "1rem", padding: "1rem", border: "1px solid #ddd" }}>
            <h3>{editingLocation ? "Edit Location" : "Add Location"}</h3>
            <div className="field">
              <label>Branch</label>
              <select
                value={locationForm.branchId}
                onChange={(e) => setLocationForm({ ...locationForm, branchId: e.target.value })}
                required
              >
                <option value="">Select Branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Name</label>
              <input
                type="text"
                value={locationForm.name}
                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                required
              />
            </div>
            <div className="button-row">
              <button type="submit">{editingLocation ? "Update" : "Create"}</button>
              <button
                type="button"
                onClick={() => {
                  setShowLocationForm(false);
                  setEditingLocation(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Location Name</th>
                <th>Bins</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location.id}>
                  <td>{location.branch?.name}</td>
                  <td>{location.name}</td>
                  <td>{location._count?.bins || 0}</td>
                  <td>
                    <button onClick={() => handleEditLocation(location)}>Edit</button>
                    <button onClick={() => handleDeleteLocation(location)} className="danger">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bins Section */}
      <section className="card">
        <div className="card-header">
          <h2>Bins</h2>
          <button
            onClick={() => {
              setShowBinForm(true);
              setEditingBin(null);
              setBinForm({ code: "", description: "", locationId: "" });
            }}
          >
            Add Bin
          </button>
        </div>

        {showBinForm && (
          <form onSubmit={handleBinSubmit} style={{ marginBottom: "1rem", padding: "1rem", border: "1px solid #ddd" }}>
            <h3>{editingBin ? "Edit Bin" : "Add Bin"}</h3>
            <div className="field">
              <label>Location</label>
              <select
                value={binForm.locationId}
                onChange={(e) => setBinForm({ ...binForm, locationId: e.target.value })}
                required
              >
                <option value="">Select Location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.branch?.name} - {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Code</label>
              <input
                type="text"
                value={binForm.code}
                onChange={(e) => setBinForm({ ...binForm, code: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Description</label>
              <input
                type="text"
                value={binForm.description}
                onChange={(e) => setBinForm({ ...binForm, description: e.target.value })}
              />
            </div>
            <div className="button-row">
              <button type="submit">{editingBin ? "Update" : "Create"}</button>
              <button
                type="button"
                onClick={() => {
                  setShowBinForm(false);
                  setEditingBin(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Location</th>
                <th>Bin Code</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((bin) => (
                <tr key={bin.id}>
                  <td>{bin.location?.branch?.name}</td>
                  <td>{bin.location?.name}</td>
                  <td>{bin.code}</td>
                  <td>{bin.description || "-"}</td>
                  <td>
                    <button onClick={() => handleEditBin(bin)}>Edit</button>
                    <button onClick={() => handleDeleteBin(bin)} className="danger">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}