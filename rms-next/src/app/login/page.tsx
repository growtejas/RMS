"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import "@/styles/legacy/Login.css";

function readFromQuery(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("from");
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [forceShowForm, setForceShowForm] = useState(false);
  const { login, isAuthenticated, user, isHydrating } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => setForceShowForm(true), 12_000);
    return () => window.clearTimeout(id);
  }, []);

  const isOwner = user?.roles?.some((r) => r === "owner");
  const isAdmin = user?.roles?.some((r) => r === "admin" || r === "owner");
  const isHr = user?.roles?.some((r) => r === "hr");
  const isTa = user?.roles?.some((r) => r === "ta");
  const isManager = user?.roles?.some((r) => r === "manager");

  useEffect(() => {
    if (isHydrating || !isAuthenticated || !user) {
      return;
    }
    const target = isOwner
      ? "/owner"
      : isAdmin
        ? "/admin"
        : isHr
          ? "/hr"
          : isTa
            ? "/ta"
            : isManager
              ? "/manager"
              : "/dashboard";
    router.replace(target);
  }, [
    isAdmin,
    isAuthenticated,
    isHr,
    isHydrating,
    isManager,
    isOwner,
    isTa,
    router,
    user,
  ]);

  if (isHydrating && isAuthenticated && !forceShowForm) {
    return (
      <div className="login-page">
        <div className="login-card single">
          <p className="form-subtitle">Restoring session…</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const loggedInUser = await login(username, password);

      const from = readFromQuery();
      const defaultRedirect = loggedInUser.roles.some(
        (r) => r === "admin" || r === "owner",
      )
        ? "/admin"
        : loggedInUser.roles.some((r) => r === "hr")
          ? "/hr"
          : loggedInUser.roles.some((r) => r === "ta")
            ? "/ta"
            : loggedInUser.roles.some((r) => r === "manager")
              ? "/manager"
              : "/dashboard";

      const target =
        from && from !== "/login" ? decodeURIComponent(from) : defaultRedirect;
      router.replace(target);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Invalid credentials. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card single">
        <div className="login-logo">
          <Image
            src="/rbm-logo.svg"
            alt="RBM Logo"
            width={160}
            height={48}
            priority
          />
        </div>

        <h2 className="form-title">Sign in</h2>
        <p className="form-subtitle">Enter your credentials to continue</p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isLoading}
              required
            />
          </div>

          <button type="submit" className="login-submit" disabled={isLoading}>
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
