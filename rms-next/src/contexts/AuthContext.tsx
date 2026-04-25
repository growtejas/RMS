"use client";

import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import axios from "axios";

import type { User, AuthContextType } from "@/types/auth";
import { fetchSession, logout as apiLogout, refreshAccessToken } from "@/lib/api/auth";

function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq);
    if (k === name) {
      return decodeURIComponent(p.slice(eq + 1));
    }
  }
  return null;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True until client has read localStorage and finished any /auth/refresh (avoids flash redirects in Next.js). */
  const [isHydrating, setIsHydrating] = useState(true);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Same-origin `/api` avoids stale inlined `NEXT_PUBLIC_API_BASE_URL` in dev.
      const apiUrl = "/api/auth/login";

      const controller = new AbortController();
      const timeoutMs = 30000;
      const timeoutId = setTimeout(
        () => controller.abort(new Error("Login request timed out")),
        timeoutMs,
      );

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
          errorMessage =
            (typeof errorData.detail === "string"
              ? errorData.detail
              : Array.isArray(errorData.detail)
                ? errorData.detail[0]?.msg ?? errorMessage
                : errorMessage) || errorMessage;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }

      let data: {
        user_id?: number;
        username?: string;
        roles?: string[];
        csrf_token?: string;
      };
      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid response from server. Please try again.");
      }
      if (
        data.user_id == null ||
        data.username == null
      ) {
        throw new Error(
          "Invalid login response (missing user). Please try again.",
        );
      }

      const normalizedRoles = Array.isArray(data.roles)
        ? data.roles.map((role: string) => role.toLowerCase())
        : [];

      const userObj: User = {
        user_id: data.user_id,
        username: data.username,
        roles: normalizedRoles,
        is_active: true,
      };

      setUser(userObj);
      setIsHydrating(false);

      return userObj;
    } catch (err) {
      let message = "An unexpected error occurred";
      if (err instanceof DOMException && err.name === "AbortError") {
        message =
          "Login request timed out. Ensure `npm run dev` is running and the app can reach /api on this host.";
      } else if (
        err instanceof TypeError &&
        err.message === "Failed to fetch"
      ) {
        message =
          "Unable to reach this app’s API (/api). Confirm `npm run dev` is running, DATABASE_URL and JWT_SECRET_KEY are set in .env.local, then restart the dev server.";
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<User | null> => {
    try {
      const data = await refreshAccessToken();
      const normalizedRoles = Array.isArray(data.roles)
        ? data.roles.map((role: string) => role.toLowerCase())
        : [];
      const userObj: User = {
        user_id: data.user_id,
        username: data.username,
        roles: normalizedRoles,
        is_active: true,
      };
      setUser(userObj);
      return userObj;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        if (status === 401 || status === 403) {
          setUser(null);
        }
      }
      return null;
    }
  }, []);

  /** Incremented so only the latest bootstrap effect may call setIsHydrating(false). */
  const bootstrapGeneration = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const path = window.location.pathname || "/";
    const first = path.split("/").filter(Boolean)[0] ?? "";
    // Public routes: skip session bootstrap (other pages use `/api/auth/session`, which avoids 401 noise).
    const skipSessionBootstrap =
      first === "unauthorized" ||
      first === "public" ||
      first === "api";

    if (skipSessionBootstrap) {
      setUser(null);
      setIsHydrating(false);
      return;
    }

    const myGen = ++bootstrapGeneration.current;
    const finishBootstrap = () => {
      if (bootstrapGeneration.current === myGen) {
        setIsHydrating(false);
      }
    };

    setIsHydrating(true);
    const maxWaitMs = 16_000;
    const maxTimer = window.setTimeout(finishBootstrap, maxWaitMs);

    (async () => {
      try {
        const session = await fetchSession();
        if (session.authenticated) {
          setUser({
            user_id: session.user_id,
            username: session.username,
            roles: Array.isArray(session.roles)
              ? session.roles.map((r) => r.toLowerCase())
              : [],
            is_active: session.is_active,
          });
        } else {
          // Access missing/expired: try refresh if we likely have a refresh cookie (httpOnly);
          // `rfm_csrf` is set with login/refresh and is a cheap signal.
          const likelyHasRefreshSession = Boolean(readBrowserCookie("rfm_csrf"));
          if (likelyHasRefreshSession) {
            await refreshSession();
          } else {
            setUser(null);
          }
        }
      } catch {
        setUser(null);
      } finally {
        window.clearTimeout(maxTimer);
        finishBootstrap();
      }
    })();

    return () => {
      bootstrapGeneration.current += 1;
      window.clearTimeout(maxTimer);
      setIsHydrating(false);
    };
  }, [refreshSession]);

  const logout = useCallback(() => {
    (async () => {
      try {
        await apiLogout();
      } finally {
        setUser(null);
        setError(null);
        setIsHydrating(false);
      }
    })();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    token: null,
    isAuthenticated: Boolean(user),
    isHydrating,
    isLoading,
    error,
    login,
    refreshSession,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
