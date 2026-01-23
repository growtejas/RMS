import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/Header.css";

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="header-left">
          <h1 className="header-title">RBM Resource Module</h1>
        </div>
        <div className="header-right">
          {user && (
            <>
              <div className="user-info">
                <span className="user-icon">👤</span>
                <div className="user-details">
                  <span className="username">{user.username}</span>
                  <span className="user-roles">
                    {user.roles.length > 0 ? user.roles.join(", ") : "No roles"}
                  </span>
                </div>
              </div>
              <button className="logout-button" onClick={handleLogout}>
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
