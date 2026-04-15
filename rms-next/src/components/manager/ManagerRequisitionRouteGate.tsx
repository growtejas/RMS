"use client";

import React, { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import ManagerRequisitionDetails from "@/components/manager/ManagerRequisitionDetails";

export default function ManagerRequisitionRouteGate() {
  const { user, isHydrating, isAuthenticated } = useAuth();
  const router = useRouter();

  const isManager = useMemo(
    () => (user?.roles || []).map((r) => r.toLowerCase()).includes("manager"),
    [user?.roles],
  );

  useEffect(() => {
    if (isHydrating) {
      return;
    }
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isHydrating, router]);

  useEffect(() => {
    if (!user || isHydrating) {
      return;
    }
    if (!isManager) {
      router.replace("/unauthorized");
    }
  }, [isHydrating, isManager, router, user]);

  if (isHydrating) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "#6b7280",
        }}
      >
        Restoring session…
      </div>
    );
  }

  if (!isAuthenticated || !user || !isManager) {
    return null;
  }

  return <ManagerRequisitionDetails />;
}
