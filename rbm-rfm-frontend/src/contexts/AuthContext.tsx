import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export interface User {
  user_id: number;
  username: string;
  roles: string[];
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("authToken");
  });
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

      // Store token and user info
      localStorage.setItem("authToken", data.access_token);
      setToken(data.access_token);
      setUser({
        user_id: data.user_id,
        username: data.username,
        roles: data.roles,
      });
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
    isAuthenticated: !!token && !!user,
    isLoading,
    error,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
