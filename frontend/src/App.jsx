// What this does: defines all routes and protects them by login + role
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./layout/AppLayout";
import { initResizableTables } from "./utils/columnResize";
import { useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import CashierDashboard from "./pages/dashboard/CashierDashboard";
import StoreKeeperDashboard from "./pages/dashboard/StoreKeeperDashboard";
import ManagerDashboard from "./pages/dashboard/ManagerDashboard";
import AccountantDashboard from "./pages/dashboard/AccountantDashboard";
import HRDashboard from "./pages/dashboard/HRDashboard";
import CEODashboard from "./pages/dashboard/CEODashboard";
import PosSearch from "./pages/pos/PosSearch";
import PosTerminal from "./pages/pos/PosTerminal";
import InvoiceList from "./pages/pos/InvoiceList";
import SalesBrowse from "./pages/pos/SalesBrowse";
import Inventory from "./pages/stock/Inventory";
import Products from "./pages/stock/Products";
import Bins from "./pages/stock/Bins";
import LowStock from "./pages/stock/LowStock";
import Transactions from "./pages/stock/Transactions";
import StockAdjustments from "./pages/stock/StockAdjustments";
import ReportsOverview from "./pages/reports/ReportsOverview";
import SalesReports from "./pages/reports/SalesReports";
import SalesSdc from "./pages/reports/SalesSdc";
import Expenses from "./pages/reports/Expenses";
import StockValuation from "./pages/reports/StockValuation";
import AuditViewer from "./pages/reports/AuditViewer";
import EbmDashboard from "./pages/reports/EbmDashboard";
import Employees from "./pages/hr/Employees";
import Attendance from "./pages/hr/Attendance";
import Advances from "./pages/hr/Advances";
import Payroll from "./pages/hr/Payroll";
import Users from "./pages/admin/Users";
import Motorbikes from "./pages/moto/Motorbikes";
import Promotions from "./pages/moto/Promotions";
import Branches from "./pages/moto/Branches";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";

const homeByRole = {
  CASHIER: "/cashier",
  STORE_KEEPER: "/storekeeper",
  MANAGER: "/manager",
  ACCOUNTANT: "/accountant",
  HR: "/hr",
  CEO: "/ceo",
  SALESPERSON: "/motorbikes",
};

function normalizeRole(role) {
  return String(role || "").trim().toUpperCase();
}

function LoginGate() {
  const { user, token } = useAuth();
  const role = normalizeRole(user?.role);
  if (token && user) {
    return <Navigate to={homeByRole[role] || "/login"} replace />;
  }
  return <Login />;
}

export default function App() {
  const location = useLocation();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => initResizableTables());
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute allowPasswordChange>
            <AppLayout>
              <ChangePassword />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/not-allowed"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Forbidden />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Cashier */}
      <Route
        path="/cashier"
        element={
          <ProtectedRoute roles={["CASHIER"]}>
            <AppLayout>
              <CashierDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos/search"
        element={
          <ProtectedRoute roles={["CASHIER", "MANAGER", "CEO"]}>
            <AppLayout>
              <PosSearch />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute roles={["CASHIER"]}>
            <AppLayout>
              <PosTerminal />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute roles={["CASHIER", "MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <InvoiceList />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedRoute roles={["SALESPERSON", "CASHIER", "MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <SalesBrowse />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Stock & Inventory */}
      <Route
        path="/stock/inventory"
        element={
          <ProtectedRoute roles={["STORE_KEEPER", "MANAGER", "CEO"]}>
            <AppLayout>
              <Inventory />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock/transactions"
        element={
          <ProtectedRoute roles={["STORE_KEEPER", "MANAGER", "CEO"]}>
            <AppLayout>
              <Transactions />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock/low-stock"
        element={
          <ProtectedRoute roles={["STORE_KEEPER", "MANAGER", "CEO"]}>
            <AppLayout>
              <LowStock />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock/adjustments"
        element={
          <ProtectedRoute roles={["STORE_KEEPER", "MANAGER", "CEO"]}>
            <AppLayout>
              <StockAdjustments />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute roles={["STORE_KEEPER", "MANAGER", "CEO"]}>
            <AppLayout>
              <Products />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bins"
        element={
          <ProtectedRoute roles={["STORE_KEEPER", "MANAGER", "CEO"]}>
            <AppLayout>
              <Bins />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Reports */}
      <Route
        path="/reports/overview"
        element={
          <ProtectedRoute roles={["MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <ReportsOverview />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/sales"
        element={
          <ProtectedRoute roles={["MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <SalesReports />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/expenses"
        element={
          <ProtectedRoute roles={["HR", "MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <Expenses />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/sales-sdc"
        element={
          <ProtectedRoute roles={["MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <SalesSdc />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/stock-valuation"
        element={
          <ProtectedRoute roles={["MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <StockValuation />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/audit"
        element={
          <ProtectedRoute roles={["MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <AuditViewer />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/ebm"
        element={
          <ProtectedRoute roles={["MANAGER", "ACCOUNTANT", "CEO"]}>
            <AppLayout>
              <EbmDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Store Keeper */}
      <Route
        path="/storekeeper"
        element={
          <ProtectedRoute roles={["STORE_KEEPER"]}>
            <AppLayout>
              <StoreKeeperDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Manager */}
      <Route
        path="/manager"
        element={
          <ProtectedRoute roles={["MANAGER", "CEO"]}>
            <AppLayout>
              <ManagerDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Accountant */}
      <Route
        path="/accountant"
        element={
          <ProtectedRoute roles={["ACCOUNTANT", "MANAGER", "CEO"]}>
            <AppLayout>
              <AccountantDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* HR */}
      <Route
        path="/hr"
        element={
          <ProtectedRoute roles={["HR", "CEO"]}>
            <AppLayout>
              <HRDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/hr/employees"
        element={
          <ProtectedRoute roles={["HR", "CEO", "MANAGER"]}>
            <AppLayout>
              <Employees />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/hr/attendance"
        element={
          <ProtectedRoute roles={["HR", "CEO", "MANAGER"]}>
            <AppLayout>
              <Attendance />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/hr/advances"
        element={
          <ProtectedRoute roles={["HR", "CEO", "MANAGER"]}>
            <AppLayout>
              <Advances />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/hr/payroll"
        element={
          <ProtectedRoute roles={["HR", "CEO", "MANAGER"]}>
            <AppLayout>
              <Payroll />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute roles={["MANAGER", "CEO"]}>
            <AppLayout>
              <Users />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/motorbikes"
        element={
          <ProtectedRoute roles={["SALESPERSON", "MANAGER", "CEO"]}>
            <AppLayout>
              <Motorbikes />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/motorbikes/branches"
        element={
          <ProtectedRoute roles={["SALESPERSON", "MANAGER", "CEO"]}>
            <AppLayout>
              <Branches />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/motorbikes/promotions"
        element={
          <ProtectedRoute roles={["SALESPERSON", "MANAGER", "CEO"]}>
            <AppLayout>
              <Promotions />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* CEO */}
      <Route
        path="/ceo"
        element={
          <ProtectedRoute roles={["CEO"]}>
            <AppLayout>
              <CEODashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
