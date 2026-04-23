"use client";

import React, { Suspense } from "react";
import { useParams } from "next/navigation";

import CandidateProfileRouteClient from "@/components/shared/CandidateProfileRouteClient";

function HrCandidateProfileInner() {
  const params = useParams();
  const raw = params?.candidateId;
  const id =
    typeof raw === "string"
      ? Number.parseInt(raw, 10)
      : Array.isArray(raw)
        ? Number.parseInt(raw[0] ?? "", 10)
        : NaN;
  if (!Number.isFinite(id)) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        Invalid candidate id.
      </div>
    );
  }
  return <CandidateProfileRouteClient candidateId={id} />;
}

export default function HrCandidateProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <HrCandidateProfileInner />
    </Suspense>
  );
}
