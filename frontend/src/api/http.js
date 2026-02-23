// What this does: creates an Axios client that automatically attaches the JWT token (if available)
import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL || "";
let authRedirectInProgress = false;

function clearAuthStorage() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

function isInvalidTokenError(error) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message || "").toLowerCase();
  return status === 401 && message.includes("invalid token");
}

export const api = axios.create({
  baseURL: apiBaseUrl,
});

// What this does: adds Authorization header to every request if token exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken") || localStorage.getItem("token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// What this does: logs out and redirects immediately when backend says token is invalid
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isInvalidTokenError(error)) {
      clearAuthStorage();

      if (!authRedirectInProgress && window.location.pathname !== "/login") {
        authRedirectInProgress = true;
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
