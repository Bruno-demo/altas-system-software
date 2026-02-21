// What this does: blocks access if not logged in, and restricts routes by role
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({
  children,
  roles,
  allowedRoles,
  allowPasswordChange,
}) {
  const { user, token } = useAuth();
  const location = useLocation();
  const roleListRaw =
    Array.isArray(roles) && roles.length > 0 ? roles : allowedRoles;
  const roleList = Array.isArray(roleListRaw)
    ? roleListRaw.map((r) => String(r || "").trim().toUpperCase())
    : [];
  const userRole = String(user?.role || "").trim().toUpperCase();

  if (!token || !user) return <Navigate to="/login" replace />;

  // What this does: forces password change when backend returns mustChangePassword=true
  if (user.mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/change-password" replace />;
  }

  // What this does: checks role-based authorization when roles are provided
  if (roleList.length > 0 && !roleList.includes(userRole)) {
    return (
      <Navigate
        to="/not-allowed"
        replace
        state={{
          debugRole: userRole,
          debugAllowedRoles: roleList,
          debugPath: `${location.pathname}${location.search || ""}`,
        }}
      />
    );
  }

  return children || <Outlet />;
}
