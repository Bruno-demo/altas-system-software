// What this does: stores user + token in React context and localStorage for role-based UI
import { createContext, useContext, useMemo, useState } from "react";

const AuthCtx = createContext(null);

function normalizeRole(role) {
  return String(role || "").trim().toUpperCase();
}

function normalizeUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    ...user,
    role: normalizeRole(user.role),
  };
}

export const AuthProvider = ({ children }) => {
  // What this does: initializes from localStorage so refresh doesn't log out
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    try {
      return normalizeUser(JSON.parse(raw));
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  });

  const login = ({ token: nextToken, user: nextUser }) => {
    const safeUser = normalizeUser(nextUser);
    setToken(nextToken);
    setUser(safeUser);
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(safeUser));
  };

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  const value = useMemo(() => ({ token, user, login, logout }), [token, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
