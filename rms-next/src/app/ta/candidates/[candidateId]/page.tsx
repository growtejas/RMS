import React, { Suspense } from "react";

import { Loader } from "@/components/ui/Loader";
import CandidateProfileRouteClient from "@/components/shared/CandidateProfileRouteClient";

function TaCandidateProfileInner({ candidateId }: { candidateId: number }) {
  const id = candidateId;
  if (!Number.isFinite(id)) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        Invalid candidate id.
      </div>
    );
  }
  return <CandidateProfileRouteClient candidateId={id} />;
}

export default function TaCandidateProfilePage({
  params,
}: {
  params: { candidateId: string };
}) {
  const id = Number.parseInt(params.candidateId, 10);
  return (
    <Suspense
      fallback={
        <div className="flex w-full min-w-0 flex-col items-center justify-center px-4 py-16 sm:min-h-[min(400px,55dvh)]">
          <Loader label="Loading candidate…" />
        </div>
      }
    >
      <TaCandidateProfileInner candidateId={id} />
    </Suspense>
  );
}
