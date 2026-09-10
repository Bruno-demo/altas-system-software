// What this does: logs the user in and stores token/user for role-based navigation
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginApi } from "../api/auth";
import { useAuth } from "../auth/AuthContext";

const seededAccounts = [
  { email: "ceo@altas.local", role: "CEO" },
  { email: "manager@altas.local", role: "MANAGER" },
  { email: "hr@altas.local", role: "HR" },
  { email: "cashier@altas.local", role: "CASHIER" },
  { email: "store@altas.local", role: "STORE_KEEPER" },
  { email: "sales@altas.local", role: "SALESPERSON" },
  { email: "accountant@altas.local", role: "ACCOUNTANT" },
];

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const seedPassword = import.meta.env.VITE_SEED_DEFAULT_PASSWORD || "Altas@2026";

  const goByRole = (role) => {
    if (role === "CASHIER") return nav("/cashier");
    if (role === "STORE_KEEPER") return nav("/storekeeper");
    if (role === "MANAGER") return nav("/manager");
    if (role === "ACCOUNTANT") return nav("/accountant");
    if (role === "HR") return nav("/hr");
    if (role === "CEO") return nav("/ceo");
    if (role === "SALESPERSON") return nav("/motorbikes");
    return nav("/not-allowed");
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const res = await loginApi({ email, password });
      login({ token: res.data.token, user: res.data.user });

      // What this does: if backend says mustChangePassword, route guard will send them to change-password
      goByRole(res.data.user.role);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page">
      <div className="login-shell">
        <section className="login-box">
          <div className="login-brand">
            <span className="brand-logo">AL-TAS</span>
            <span className="brand-tag">Operations Platform</span>
          </div>

          <div className="login-card">
            <h1>Welcome back</h1>
            <p className="muted login-subtitle">Use your company account to continue.</p>

            {msg ? <div className="alert login-alert">{msg}</div> : null}

            <form className="card form" onSubmit={submit}>
              <label className="field">
                Email
                <input
                  placeholder="Email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Password
                <input
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Login"}
              </button>
            </form>
          </div>
        </section>

        <aside className="login-demo">
          <div className="demo-head">
            <span className="demo-title">Seeded demo accounts</span>
            <span className="demo-password">Password: {seedPassword}</span>
          </div>
          <div className="demo-list">
            {seededAccounts.map((account) => (
              <div className="demo-row" key={account.email}>
                <span className="demo-email">{account.email}</span>
                <span className="demo-role">{account.role}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
