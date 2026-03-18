import api from "./http";

export const listAccounts = (params) => api.get("/api/accounting/accounts", { params });
export const createAccount = (data) => api.post("/api/accounting/accounts", data);
export const updateAccount = (id, data) => api.put(`/api/accounting/accounts/${id}`, data);
export const seedDefaultAccounts = () => api.post("/api/accounting/accounts/seed-defaults");

export const listJournalEntries = (params) => api.get("/api/accounting/journals", { params });
export const createJournalEntry = (data) => api.post("/api/accounting/journals", data);
export const reverseJournalEntry = (id) => api.post(`/api/accounting/journals/${id}/reverse`);

export const getLedger = (params) => api.get("/api/accounting/ledger", { params });
export const getTrialBalance = (params) => api.get("/api/accounting/trial-balance", { params });
export const getStatements = (params) => api.get("/api/accounting/statements", { params });
