import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const homeByRole = {
  CASHIER: "/cashier",
  STORE_KEEPER: "/storekeeper",
  MANAGER: "/manager",
  HR: "/hr",
  CEO: "/ceo",
  SALESPERSON: "/motorbikes",
};

export default function Forbidden() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();
  const role = String(user?.role || "").trim().toUpperCase();
  const home = token && user ? homeByRole[role] || "/login" : "/login";

  // What this does: temporary debug visibility for role mismatch investigations.
  const debugRole = location.state?.debugRole || role || "-";
  const debugAllowed = Array.isArray(location.state?.debugAllowedRoles)
    ? location.state.debugAllowedRoles
    : [];
  const debugPath = location.state?.debugPath || "-";
  const showDebug = true;

  return (
    <div className="page status-page">
      <div className="card status-card">
        <div className="status-badge">403</div>
        <h2 className="status-title">Access denied</h2>
        <p className="muted status-subtitle">
          You do not have permission to view this page. If you think this is a
          mistake, contact your administrator.
        </p>
        {showDebug ? (
          <div className="status-debug-badge">
            <div className="status-debug-title">Debug Role Badge (Temporary)</div>
            <div>
              <b>Role:</b> {debugRole}
            </div>
            <div>
              <b>Allowed:</b> {debugAllowed.length ? debugAllowed.join(", ") : "-"}
            </div>
            <div>
              <b>Path:</b> {debugPath}
            </div>
          </div>
        ) : null}
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
