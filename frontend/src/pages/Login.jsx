// What this does: logs the user in and stores token/user for role-based navigation
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginApi } from "../api/auth";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

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
        <h1>Sign in</h1>
        <p className="muted">Use your company account to continue.</p>

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
    </div>
  );
}
