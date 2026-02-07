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
  } catch {
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = "Login failed. Please try again.";
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // If response is not JSON, use default message
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

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
      let message = "An unexpected error occurred";
      if (err instanceof DOMException && err.name === "AbortError") {
        message =
          "Login request timed out. Please check if the server is running.";
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        message = "Unable to reach the server. Please check your connection.";
      } else if (err instanceof Error) {
        message = err.message;
      }
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
