import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import ProtectedRoute from "../components/ProtectedRoute";

const Dashboard = () => (
  <div style={{ padding: "20px" }}>
    <h1>Dashboard</h1>
    <p>Welcome to RBM Resource Fulfillment Module</p>
  </div>
);

const Unauthorized = () => (
  <div style={{ padding: "20px", textAlign: "center" }}>
    <h1>Unauthorized</h1>
    <p>You don't have permission to access this page.</p>
  </div>
);

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
