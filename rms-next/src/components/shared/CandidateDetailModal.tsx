"use client";

/**
 * CandidateDetailModal — Modal shell over {@link CandidateDetailView}.
 * Prefer navigating to the full-page candidate profile from requisition views.
 */
import React from "react";

import CandidateDetailView, {
  type CandidateDetailViewProps,
} from "@/components/shared/CandidateDetailView";

/** Re-export for callers that need the 403 message text. */
export { TA_OWNERSHIP_DENIED_MESSAGE } from "@/lib/api/candidateApi";

export type CandidateDetailModalProps = Omit<
  CandidateDetailViewProps,
  "onDismiss" | "variant"
> & {
  onClose: () => void;
};

export default function CandidateDetailModal({
  onClose,
  ...rest
}: CandidateDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 px-2 py-6 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="flex w-full max-w-2xl justify-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-profile-title"
      >
        <CandidateDetailView
          {...rest}
          variant="modal"
          onDismiss={onClose}
        />
      </div>
    </div>
  );
}
