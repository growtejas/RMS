import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/Login.css";

const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const loggedInUser = await login(username, password);

      // If user was redirected here, go back to requested page (but ignore stale /login)
      const fromState = (location.state as { from?: { pathname?: string } })
        ?.from?.pathname;

      // Default: admin/owner to /admin, otherwise /dashboard
      const defaultRedirect = loggedInUser.roles.some(
        (r) => r === "admin" || r === "owner",
      )
        ? "/admin"
        : "/dashboard";

      const target =
        fromState && fromState !== "/login" ? fromState : defaultRedirect;
      navigate(target, { replace: true });
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorDetail = (err as any).response?.data?.detail;
      setError(errorDetail || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (role: "admin" | "manager" | "user" | "owner") => {
    // Demo credentials for testing
    const demoCredentials = {
      admin: { username: "admin", password: "password" },
      manager: { username: "manager", password: "password" },
      user: { username: "hr", password: "password" },
      owner: { username: "owner", password: "password" },
    };

    setUsername(demoCredentials[role].username);
    setPassword(demoCredentials[role].password);
  };

  return (
    <div className="login-container">
      {/* Background Decoration */}
      <div className="login-background">
        <div className="gradient-blob blob-1"></div>
        <div className="gradient-blob blob-2"></div>
        <div className="gradient-blob blob-3"></div>
      </div>

      {/* Main Content */}
      <div className="login-content">
        {/* Left Panel - Brand/Info */}
        <div className="login-brand-panel">
          <div className="brand-content">
            <div className="brand-logo">
              <div className="logo-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L2 7L12 12L22 7L12 2Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M2 17L12 22L22 17"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M2 12L12 17L22 12"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <h1>RBM</h1>
            </div>
            <h2 className="brand-title">Resource Business Management</h2>
            <p className="brand-subtitle">
              Streamline your resource allocation, track employee lifecycle, and
              manage organizational structure efficiently.
            </p>

            {/* Features List */}
            <div className="features-list">
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Employee Lifecycle Management</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Role-Based Access Control</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Real-time Audit Logging</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Secure & Compliant</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="login-form-panel">
          <div className="form-wrapper">
            <div className="form-header">
              <h2>Welcome Back</h2>
              <p>Sign in to your account to continue</p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <div className="input-with-icon">
                  <span className="input-icon">👤</span>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="form-group">
                {/* <div className="password-label-row">
                  <label htmlFor="password">Password</label>
                  <a href="/forgot-password" className="forgot-password">
                    Forgot password?
                  </a>
                </div> */}
                <div className="input-with-icon">
                  <span className="input-icon">🔒</span>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => {
                      const input = document.getElementById(
                        "password",
                      ) as HTMLInputElement;
                      input.type =
                        input.type === "password" ? "text" : "password";
                    }}
                  >
                    👁️
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="form-options">
                <label className="checkbox-label">
                  <input type="checkbox" />
                  <span className="checkmark"></span>
                  Remember me
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="login-button"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="spinner"></span>
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>

              {/* Demo Login Section */}
              <div className="demo-login-section">
                <div className="demo-divider">
                  <span>Quick Demo</span>
                </div>

                <div className="demo-buttons">
                  <button
                    type="button"
                    className="demo-button admin"
                    onClick={() => handleDemoLogin("admin")}
                  >
                    Admin Access
                  </button>
                  <button
                    type="button"
                    className="demo-button manager"
                    onClick={() => handleDemoLogin("manager")}
                  >
                    Manager Access
                  </button>
                  <button
                    type="button"
                    className="demo-button user"
                    onClick={() => handleDemoLogin("user")}
                  >
                    Hr/Ta Access
                  </button>
                  <button
                    type="button"
                    className="demo-button owner"
                    onClick={() => handleDemoLogin("owner")}
                  >
                    Owner Access
                  </button>
                </div>
              </div>

              {/* Footer Links */}
              <div className="form-footer">
                <p>
                  Don't have an account? <a href="">Request Access</a>
                </p>
                <div className="tech-info">
                  <span className="tech-badge">React 19</span>
                  <span className="tech-badge">TypeScript</span>
                  <span className="tech-badge">FastAPI</span>
                  <span className="tech-badge">PostgreSQL</span>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
