"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import "@/styles/legacy/Login.css";

type Me = {
  user_id: number;
  username: string;
  roles: string[];
  organization_id: string;
  is_active: boolean;
};

type AccessRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  created_at: string | null;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
};

function roleHome(roles: string[]): string {
  const r = roles.map((x) => x.toLowerCase());
  if (r.includes("owner")) return "/owner";
  if (r.includes("admin")) return "/admin";
  if (r.includes("hr")) return "/hr";
  if (r.includes("ta")) return "/ta";
  if (r.includes("manager")) return "/manager";
  return "/dashboard";
}

export default function AccessRequestPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [reqRow, setReqRow] = useState<AccessRequest | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowed = useMemo(() => {
    if (!me) return false;
    return me.is_active && (me.roles?.length ?? 0) > 0;
  }, [me]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const meRes = await fetch("/api/auth/session", { cache: "no-store" });
        if (!meRes.ok) {
          router.replace("/login");
          return;
        }
        const session = (await meRes.json()) as
          | { authenticated: false }
          | (Me & { authenticated: true });
        if (!session.authenticated) {
          router.replace("/login");
          return;
        }
        const meJson: Me = {
          user_id: session.user_id,
          username: session.username,
          roles: session.roles,
          organization_id: session.organization_id,
          is_active: session.is_active,
        };
        if (cancelled) return;
        setMe(meJson);
        if (meJson.is_active && (meJson.roles?.length ?? 0) > 0) {
          router.replace(roleHome(meJson.roles));
          return;
        }
        const r = await fetch("/api/access-requests/me", { cache: "no-store" });
        const j = (await r.json()) as { access_request: AccessRequest | null };
        if (!cancelled) {
          setReqRow(j.access_request);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() || null }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        access_request?: AccessRequest;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(json.detail || "Request failed");
      }
      setReqRow((json.access_request as AccessRequest) ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="login-page access-request-body">
        <div className="login-card single">
          <div className="login-logo">
            <Image
              src="/rbm-logo.svg"
              alt="RBM"
              width={160}
              height={48}
              priority
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <p className="form-subtitle" style={{ marginBottom: 0 }}>
            Loading your request…
          </p>
        </div>
      </div>
    );
  }

  if (isAllowed) {
    return null;
  }

  const status = reqRow?.status ?? null;

  return (
    <div className="login-page access-request-body">
      <div className="login-card single">
        <div className="login-logo">
          <Image
            src="/rbm-logo.svg"
            alt="RBM"
            width={160}
            height={48}
            priority
            style={{ width: "auto", height: "auto" }}
          />
        </div>

        <h2 className="form-title">Request access</h2>
        <p className="form-subtitle">
          Your account needs approval before you can use the application. An administrator will
          review your request and assign a role.
        </p>

        {me ? (
          <div className="access-user-panel">
            <strong>{me.username}</strong>
            <span>
              Status: {me.is_active ? "Active" : "Inactive"}
              <br />
              Roles: {me.roles.length > 0 ? me.roles.join(", ") : "None assigned yet"}
            </span>
          </div>
        ) : null}

        {status === "pending" ? (
          <div className="access-notice access-notice--pending" style={{ marginBottom: 12 }}>
            Your request is pending approval. We&apos;ll email you or you can return here after an
            admin has responded.
          </div>
        ) : status === "approved" ? (
          <div className="access-notice access-notice--success" style={{ marginBottom: 12 }}>
            Your request was approved. Redirecting…
          </div>
        ) : status === "rejected" ? (
          <div className="access-notice access-notice--error" style={{ marginBottom: 12 }}>
            Your request was rejected. If this was a mistake, contact your administrator.
          </div>
        ) : (
          <>
            <label className="access-field-label" htmlFor="access-message">
              Message (optional)
            </label>
            <textarea
              id="access-message"
              className="access-request-textarea"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Briefly describe what you need access for (team, function, etc.)"
            />

            {error ? <div className="form-error">{error}</div> : null}

            <button
              type="button"
              className="login-submit"
              style={{ width: "100%" }}
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Submitting…" : "Submit access request"}
            </button>
          </>
        )}

        <button
          type="button"
          className="login-btn-secondary"
          onClick={handleLogout}
          style={{ marginTop: 16 }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
