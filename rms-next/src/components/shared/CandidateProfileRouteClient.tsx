"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/contexts/useAuth";
import {
  getCandidateWithApplication,
  type Candidate,
} from "@/lib/api/candidateApi";
import { fetchEvaluationContextForItem } from "@/lib/candidate-profile/evaluation-context-from-requisition";
import type { EvaluationCardContext } from "@/components/evaluation/mapRankedCandidateToEvaluationCard";

import CandidateDetailView from "./CandidateDetailView";

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default function CandidateProfileRouteClient({
  candidateId,
}: {
  candidateId: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const applicationId = parsePositiveInt(searchParams.get("application_id"));
  const workspaceRaw = searchParams.get("workspace");
  const pipelineWorkspace =
    workspaceRaw === "evaluate" || workspaceRaw === "execute"
      ? workspaceRaw
      : "execute";
  const returnTo = searchParams.get("returnTo");

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluationContext, setEvaluationContext] = useState<
    EvaluationCardContext | undefined
  >(undefined);

  const userRoles = user?.roles ?? [];

  const handleDismiss = useCallback(() => {
    if (returnTo?.startsWith("/")) {
      router.push(returnTo);
      return;
    }
    router.back();
  }, [router, returnTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const row = await getCandidateWithApplication(
          candidateId,
          applicationId,
        );
        if (cancelled) return;
        setCandidate(row);
      } catch {
        if (cancelled) return;
        setCandidate(null);
        setLoadError("Could not load candidate.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateId, applicationId]);

  useEffect(() => {
    if (!candidate?.requisition_id || !candidate.requisition_item_id) {
      setEvaluationContext(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ctx = await fetchEvaluationContextForItem(
          candidate.requisition_id!,
          candidate.requisition_item_id!,
        );
        if (!cancelled) {
          setEvaluationContext(ctx);
        }
      } catch {
        if (!cancelled) {
          setEvaluationContext(undefined);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate?.requisition_id, candidate?.requisition_item_id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading candidate…
      </div>
    );
  }

  if (loadError || !candidate) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-700">{loadError ?? "Not found."}</p>
        <button
          type="button"
          onClick={handleDismiss}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Go back
        </button>
      </div>
    );
  }

  const evaluationShortlistBlocked = !candidate.resume_path;

  return (
    <CandidateDetailView
      candidate={candidate}
      onDismiss={handleDismiss}
      onUpdate={(updated) => setCandidate(updated)}
      userRoles={userRoles}
      evaluationContext={evaluationContext}
      evaluationShortlistBlocked={evaluationShortlistBlocked}
      evaluationShortlistBlockedReason={
        evaluationShortlistBlocked
          ? "Candidate resume must be uploaded before shortlisting"
          : undefined
      }
      pipelineWorkspace={pipelineWorkspace}
      variant="page"
    />
  );
}
