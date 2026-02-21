// What this does: shows different sidebar links depending on the logged-in user's role
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const linkStyle = ({ isActive }) =>
  isActive ? "nav-link nav-link-active" : "nav-link";

const linksByRole = {
  CASHIER: [
    { to: "/cashier", label: "Cashier Dashboard" },
    { to: "/pos", label: "POS Terminal" },
    { to: "/pos/search", label: "POS Search" },
    { to: "/invoices", label: "Invoice List" },
    { to: "/sales", label: "Sales" },
  ],
  STORE_KEEPER: [
    { to: "/storekeeper", label: "Store Keeper Dashboard" },
    { to: "/stock/inventory", label: "Inventory" },
    { to: "/stock/transactions", label: "Stock Transactions" },
    { to: "/stock/low-stock", label: "Low Stock" },
    { to: "/stock/adjustments", label: "Stock Adjustments" },
    { to: "/products", label: "Products" },
    { to: "/bins", label: "Bins" },
  ],
  MANAGER: [
    { to: "/manager", label: "Manager Dashboard" },
    { to: "/admin/users", label: "System Users" },
    { to: "/motorbikes", label: "Motorbikes" },
    { to: "/motorbikes/branches", label: "Branches" },
    { to: "/motorbikes/promotions", label: "Promotions" },
    { to: "/reports/overview", label: "Reports Overview" },
    { to: "/reports/expenses", label: "Expenses" },
    { to: "/reports/sales", label: "Sales Reports" },
    { to: "/reports/sales-sdc", label: "SDC Sales" },
    { to: "/reports/ebm", label: "EBM Dashboard" },
    { to: "/reports/stock-valuation", label: "Stock Valuation" },
    { to: "/reports/audit", label: "Audit Viewer" },
    { to: "/hr/employees", label: "Employees" },
    { to: "/hr/attendance", label: "Attendance" },
    { to: "/hr/advances", label: "Salary Advances" },
    { to: "/hr/payroll", label: "Payroll" },
    { to: "/pos/search", label: "POS Search" },
    { to: "/invoices", label: "Invoice List" },
    { to: "/sales", label: "Sales" },
    { to: "/stock/inventory", label: "Inventory" },
    { to: "/stock/transactions", label: "Stock Transactions" },
    { to: "/stock/low-stock", label: "Low Stock" },
    { to: "/stock/adjustments", label: "Stock Adjustments" },
    { to: "/products", label: "Products" },
    { to: "/bins", label: "Bins" },
  ],
  HR: [
    { to: "/hr", label: "HR Dashboard" },
    { to: "/reports/expenses", label: "Expenses" },
    { to: "/hr/employees", label: "Employees" },
    { to: "/hr/attendance", label: "Attendance" },
    { to: "/hr/advances", label: "Salary Advances" },
    { to: "/hr/payroll", label: "Payroll" },
  ],
  SALESPERSON: [
    { to: "/motorbikes", label: "Motorbikes" },
    { to: "/motorbikes/branches", label: "Branches" },
    { to: "/motorbikes/promotions", label: "Promotions" },
    { to: "/sales", label: "Sales" },
  ],
  CEO: [
    { to: "/ceo", label: "CEO Dashboard" },
    { to: "/admin/users", label: "System Users" },
    { to: "/motorbikes", label: "Motorbikes" },
    { to: "/motorbikes/branches", label: "Branches" },
    { to: "/motorbikes/promotions", label: "Promotions" },
    { to: "/reports/overview", label: "Reports Overview" },
    { to: "/reports/expenses", label: "Expenses" },
    { to: "/reports/sales", label: "Sales Reports" },
    { to: "/reports/ebm", label: "EBM Dashboard" },
    { to: "/reports/stock-valuation", label: "Stock Valuation" },
    { to: "/reports/audit", label: "Audit Viewer" },
    { to: "/hr/employees", label: "Employees" },
    { to: "/hr/attendance", label: "Attendance" },
    { to: "/hr/advances", label: "Salary Advances" },
    { to: "/hr/payroll", label: "Payroll" },
    { to: "/pos/search", label: "POS Search" },
    { to: "/invoices", label: "Invoice List" },
    { to: "/stock/inventory", label: "Inventory" },
    { to: "/stock/transactions", label: "Stock Transactions" },
    { to: "/stock/low-stock", label: "Low Stock" },
    { to: "/stock/adjustments", label: "Stock Adjustments" },
    { to: "/products", label: "Products" },
    { to: "/bins", label: "Bins" },
  ],
};

export default function Sidebar({ isOpen = false, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = String(user?.role || "").trim().toUpperCase();
  const links = linksByRole[role] || [];

  const handleLogout = () => {
    logout();
    if (onClose) onClose();
    navigate("/login", { replace: true });
  };

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-header">
        <div className="sidebar-title">AL-TAHS System</div>
        <div className="sidebar-subtitle">{user?.fullName || "Guest"}</div>
        <div className="sidebar-role">{user?.role || ""}</div>
        <button type="button" className="sidebar-close" onClick={onClose}>
          Close
        </button>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={linkStyle}
            end={link.to === "/pos" || link.to === "/hr" || link.to === "/motorbikes"}
            onClick={onClose}
          >
            {link.label}
          </NavLink>
        ))}
        <NavLink
          to="/change-password"
          className={linkStyle}
          onClick={onClose}
        >
          Change Password
        </NavLink>
      </nav>

      <button className="sidebar-logout" type="button" onClick={handleLogout}>
        Logout
      </button>
    </aside>
  );
}
