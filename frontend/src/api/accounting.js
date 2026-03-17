import api from "./http";

export const listAccounts = (params) => api.get("/accounting/accounts", { params });
export const createAccount = (data) => api.post("/accounting/accounts", data);
export const updateAccount = (id, data) => api.put(`/accounting/accounts/${id}`, data);
export const seedDefaultAccounts = () => api.post("/accounting/accounts/seed-defaults");

export const listJournalEntries = (params) => api.get("/accounting/journals", { params });
export const createJournalEntry = (data) => api.post("/accounting/journals", data);
export const reverseJournalEntry = (id) => api.post(`/accounting/journals/${id}/reverse`);

export const getLedger = (params) => api.get("/accounting/ledger", { params });
export const getTrialBalance = (params) => api.get("/accounting/trial-balance", { params });
export const getStatements = (params) => api.get("/accounting/statements", { params });
