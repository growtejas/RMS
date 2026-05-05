"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { getCandidate, type Candidate } from "@/lib/api/candidateApi";
import { CandidateIntelligencePanel } from "@/components/shared/CandidateIntelligencePanel";
import { Loader } from "@/components/ui/Loader";

export default function CieCandidateIntelPage({ candidateId }: { candidateId: number }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await getCandidate(candidateId);
      setCandidate(row);
    } catch {
      setCandidate(null);
      setError("Could not load candidate.");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex w-full min-w-0 flex-col items-center justify-center px-4 py-16 sm:min-h-[min(400px,55dvh)]">
        <Loader label="Loading candidate intelligence…" />
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-700">{error ?? "Not found."}</p>
        <Link
          href="/ta/cie"
          className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Back to CIE
        </Link>
      </div>
    );
  }

  return (
    <div className="master-data-manager">
      <div className="data-manager-header" style={{ marginBottom: "20px" }}>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/ta/cie"
            className="text-sm font-medium text-[var(--primary-accent)] hover:underline"
          >
            ← CIE workspace
          </Link>
        </div>
        <h1 style={{ marginTop: "12px" }}>{candidate.full_name}</h1>
        <p className="subtitle">
          Intelligence only — REQ-{candidate.requisition_id} · {candidate.email}
        </p>
      </div>

      <CandidateIntelligencePanel candidate={candidate} onRefresh={load} />
    </div>
  );
}
