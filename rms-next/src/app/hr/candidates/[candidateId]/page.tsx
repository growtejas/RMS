"use client";

import React, { Suspense } from "react";
import { useParams } from "next/navigation";

import HrPageLayout from "@/components/hr/HrPageLayout";
import { Loader } from "@/components/ui/Loader";
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
    <HrPageLayout maxWidthClass="max-w-none w-full">
      <Suspense
        fallback={
          <div className="flex w-full min-w-0 flex-col items-center justify-center py-16 sm:min-h-[min(400px,55dvh)]">
            <Loader label="Loading candidate…" />
          </div>
        }
      >
        <HrCandidateProfileInner />
      </Suspense>
    </HrPageLayout>
  );
}
