import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

import { User, AuthContextType } from "../types/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const parseUserFromToken = (token: string | null): User | null => {
  if (!token) {
    return null;
  }

  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(atob(payload));
    const roles = Array.isArray(decoded.roles)
      ? decoded.roles.map((role: string) => role.toLowerCase())
      : [];

    return {
      user_id: Number(decoded.sub),
      username: decoded.username || "",
      roles,
    };
  } catch (error) {
    console.error("❌ Failed to parse token payload:", error);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("authToken");
  });
  const [user, setUser] = useState<User | null>(() =>
    parseUserFromToken(localStorage.getItem("authToken")),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_API_BASE_URL}/auth/login`;
      console.log("🔐 Login attempt to:", apiUrl);
      console.log("📊 Credentials:", { username });

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      console.log("📡 Response status:", response.status);

      if (!response.ok) {
        let errorMessage = "Login failed. Please try again.";
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
          console.error("❌ API Error:", errorData);
        } catch {
          // If response is not JSON, use default message
          console.error("❌ Non-JSON error response");
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("✅ Login successful:", {
        user_id: data.user_id,
        username: data.username,
      });

      // Normalize roles to lowercase for consistent RBAC checks
      const normalizedRoles = Array.isArray(data.roles)
        ? data.roles.map((role: string) => role.toLowerCase())
        : [];

      const userObj: User = {
        user_id: data.user_id,
        username: data.username,
        roles: normalizedRoles,
      };

      // Store token and user info
      localStorage.setItem("authToken", data.access_token);
      setToken(data.access_token);
      setUser(userObj);

      return userObj;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("💥 Login error:", message);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("authToken");
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token,
    isLoading,
    error,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
