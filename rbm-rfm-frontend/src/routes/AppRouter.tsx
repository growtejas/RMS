import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import Header from "../components/Header";
import ProtectedRoute from "../components/ProtectedRoute";
import AdminDashboard from "../components/admin/Dashboard";
import HrDashboard from "../components/hr/Dashboard";
import { useAuth } from "../contexts/AuthContext";

const Dashboard = () => (
  <div style={{ padding: "40px 20px" }}>
    <h1>Dashboard</h1>
    <p>Welcome to RBM Resource Fulfillment Module</p>
  </div>
);

const Unauthorized = () => (
  <div style={{ padding: "40px 20px", textAlign: "center" }}>
    <h1>Unauthorized</h1>
    <p>You don't have permission to access this page.</p>
  </div>
);

// Layout wrapper for protected pages with header
const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
    <Header />
    <main style={{ flex: 1 }}>{children}</main>
  </div>
);

export const AppRouter = () => {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.roles?.some((r) => r === "admin" || r === "owner");
  const isHr = user?.roles?.some((r) => r === "hr");

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate
                to={isAdmin ? "/admin" : isHr ? "/hr" : "/dashboard"}
                replace
              />
            ) : (
              <Login />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <ProtectedLayout>
                <Dashboard />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRoles={["admin", "owner"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hr"
          element={
            <ProtectedRoute requiredRoles={["hr"]}>
              <HrDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/overview"
          element={<Navigate to="/admin" replace />}
        />
        <Route
          path="/unauthorized"
          element={
            <ProtectedLayout>
              <Unauthorized />
            </ProtectedLayout>
          }
        />
        <Route
          path="/"
          element={<Navigate to={isHr ? "/hr" : "/dashboard"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
};
