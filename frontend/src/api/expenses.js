import { api } from "./http";

export const listExpenses = (params) =>
  api.get("/api/expenses", { params });

export const createExpense = (payload) =>
  api.post("/api/expenses", payload);

export const updateExpense = (id, payload) =>
  api.put(`/api/expenses/${id}`, payload);

export const softDeleteExpense = (id) =>
  api.delete(`/api/expenses/${id}`);

export const getExpensesSummary = (params) =>
  api.get("/api/expenses/summary", { params });

export const exportExpensesExcel = (params) =>
  api.get("/api/expenses/export/excel", {
    params,
    responseType: "blob",
  });
