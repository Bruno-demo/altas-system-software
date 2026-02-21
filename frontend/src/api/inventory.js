// What this does: wraps inventory, product, bin, and stock endpoints
import { api } from "./http";

export const listProducts = (params) => api.get("/api/products", { params });
export const createProduct = (payload) => api.post("/api/products", payload);
export const updateProduct = (id, payload) =>
  api.put(`/api/products/${id}`, payload);
export const getProductAvailability = (productId, params) =>
  api.get(`/api/products/${productId}/availability`, { params });

export const listLocations = () => api.get("/api/locations");
export const createLocation = (payload) => api.post("/api/locations", payload);
export const updateLocation = (id, payload) =>
  api.put(`/api/locations/${id}`, payload);
export const deleteLocation = (id) => api.delete(`/api/locations/${id}`);

export const listBins = (params) => api.get("/api/bins", { params });
export const createBin = (payload) => api.post("/api/bins", payload);

export const listInventory = (params) => api.get("/api/stock/inventory", { params });
export const listTransactions = (params) =>
  api.get("/api/stock/transactions", { params });
export const listLowStock = (params) => api.get("/api/stock/low-stock", { params });

export const stockIn = (payload) => api.post("/api/stock/in", payload);
export const stockOut = (payload) => api.post("/api/stock/out", payload);
export const stockDamage = (payload) => api.post("/api/stock/damage", payload);
