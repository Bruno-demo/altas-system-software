import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const homeByRole = {
  CASHIER: "/cashier",
  STORE_KEEPER: "/storekeeper",
  MANAGER: "/manager",
  ACCOUNTANT: "/accountant",
  HR: "/hr",
  CEO: "/ceo",
  SALESPERSON: "/motorbikes",
};

export default function NotFound() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  const home = token && user ? homeByRole[user.role] || "/login" : "/login";

  return (
    <div className="page status-page">
      <div className="card status-card">
        <div className="status-badge status-badge-muted">404</div>
        <h2 className="status-title">Page not found</h2>
        <p className="muted status-subtitle">
          The page you are looking for does not exist. Check the address or
          return to a safe page.
        </p>
        <div className="status-actions">
          <button type="button" onClick={() => navigate(-1)}>
            Go Back
          </button>
          <Link className="button-outline" to={home}>
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
