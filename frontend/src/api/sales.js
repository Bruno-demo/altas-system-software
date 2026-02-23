// What this does: wraps sales endpoints for POS (create sale + list invoices)
import { api } from "./http";

export const searchProducts = (q, locationId) =>
  api.get("/api/pos/products/search", {
    params: {
      q,
      ...(locationId ? { locationId } : {}),
    },
  });

export const createSale = (payload) => api.post("/api/pos/sales", payload);

export const listInvoices = (params) => api.get("/api/sales", { params });

// What this does: fetches receipt HTML using auth header, so we can print without opening protected URL directly
export const fetchReceiptHtml = (saleId) =>
  api.get(`/api/sales/${saleId}/receipt-html`, {
    headers: { Accept: "text/html" },
    responseType: "text",
  });

export const getInvoice = (saleId) => api.get(`/api/sales/${saleId}`);
