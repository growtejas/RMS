"use client";

import { useContext } from "react";
import {
  AuthActionsContext,
  AuthContext,
  AuthStateContext,
} from "./AuthContext";

/**
 * @deprecated Phase 6 - prefer `useAuthState` (subscribes only to the
 * fields you read) or `useAuthActions` (stable callback identities).
 *
 * Kept for backwards compatibility with the existing call sites; these
 * still work and now subscribe to a memoised value, so they only
 * re-render when an auth field actually changes - not on every parent
 * re-render as before.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useAuthState() {
  const ctx = useContext(AuthStateContext);
  if (ctx === undefined) {
    throw new Error("useAuthState must be used within an AuthProvider");
  }
  return ctx;
}

export function useAuthActions() {
  const ctx = useContext(AuthActionsContext);
  if (ctx === undefined) {
    throw new Error("useAuthActions must be used within an AuthProvider");
  }
  return ctx;
}
