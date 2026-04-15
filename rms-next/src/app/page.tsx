"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";

export default function Home() {
  const { isAuthenticated, user, isHydrating } = useAuth();
  const router = useRouter();

  const isOwner = user?.roles?.some((r) => r === "owner");
  const isAdmin = user?.roles?.some((r) => r === "admin" || r === "owner");
  const isHr = user?.roles?.some((r) => r === "hr");
  const isTa = user?.roles?.some((r) => r === "ta");
  const isManager = user?.roles?.some((r) => r === "manager");

  useEffect(() => {
    if (isHydrating) {
      return;
    }
    if (!isAuthenticated) {
      router.replace("/login");
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
    isAuthenticated,
    isAdmin,
    isHr,
    isHydrating,
    isManager,
    isOwner,
    isTa,
    router,
  ]);

  if (isHydrating) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "#6b7280",
        }}
      >
        {isAuthenticated ? "Restoring session…" : "Loading…"}
      </div>
    );
  }

  return null;
}
