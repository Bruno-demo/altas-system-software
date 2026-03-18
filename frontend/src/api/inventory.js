// What this does: wraps inventory, product, bin, and stock endpoints
import { api } from "./http";

export const listProducts = (params) => api.get("/api/products", { params });
export const createProduct = (payload) => api.post("/api/products", payload);
export const updateProduct = (id, payload) =>
  api.put(`/api/products/${id}`, payload);
export const getProductAvailability = (productId, params) =>
  api.get(`/api/products/${productId}/availability`, { params });

// Branch operations
export const listBranches = (params) => api.get("/api/branches", { params });
export const createBranch = (payload) => api.post("/api/branches", payload);
export const getBranchById = (id) => api.get(`/api/branches/${id}`);
export const updateBranch = (id, payload) =>
  api.put(`/api/branches/${id}`, payload);
export const deleteBranch = (id) => api.delete(`/api/branches/${id}`);

// Location operations
export const listLocations = (params) => api.get("/api/locations", { params });
export const createLocation = (payload) => api.post("/api/locations", payload);
export const getLocationById = (id) => api.get(`/api/locations/${id}`);
export const updateLocation = (id, payload) =>
  api.put(`/api/locations/${id}`, payload);
export const deleteLocation = (id) => api.delete(`/api/locations/${id}`);

// Bin operations
export const listBins = (params) => api.get("/api/bins", { params });
export const createBin = (payload) => api.post("/api/bins", payload);
export const getBinById = (id) => api.get(`/api/bins/${id}`);
export const updateBin = (id, payload) =>
  api.put(`/api/bins/${id}`, payload);
export const deleteBin = (id) => api.delete(`/api/bins/${id}`);

export const listInventory = (params) => api.get("/api/stock/inventory", { params });
export const listTransactions = (params) =>
  api.get("/api/stock/transactions", { params });
export const listLowStock = (params) => api.get("/api/stock/low-stock", { params });

export const stockIn = (payload) => api.post("/api/stock/in", payload);
export const stockOut = (payload) => api.post("/api/stock/out", payload);
export const stockDamage = (payload) => api.post("/api/stock/damage", payload);
