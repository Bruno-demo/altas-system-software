// What this does: wraps motorbike promotion endpoints
import { api } from "./http";

export const listPromotions = (params) =>
  api.get("/api/motorbikes/promotions", { params });
export const createPromotion = (payload) =>
  api.post("/api/motorbikes/promotions", payload);
export const updatePromotion = (id, payload) =>
  api.put(`/api/motorbikes/promotions/${id}`, payload);
export const deletePromotion = (id) =>
  api.delete(`/api/motorbikes/promotions/${id}`);
export const importPromotions = (payload) =>
  api.post("/api/motorbikes/promotions/import", payload);
export const exportPromotions = (params) =>
  api.get("/api/motorbikes/promotions/export", {
    params,
    responseType: "arraybuffer",
  });

export const listBranches = (params) =>
  api.get("/api/motorbikes/branches", { params });

export const getBranchDetail = (params) =>
  api.get("/api/motorbikes/branches/detail", { params });

export const updateBranchSettings = (payload) =>
  api.put("/api/motorbikes/branches/settings", payload);
