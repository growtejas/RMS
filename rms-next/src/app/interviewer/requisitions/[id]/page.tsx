"use client";

import { useRouter } from "next/navigation";
import RequisitionDetailRoot from "@/components/ta/requisition-detail/RequisitionDetailRoot";

export default function InterviewerRequisitionDetailPage() {
  const router = useRouter();
  return (
    <RequisitionDetailRoot
      readOnly
      candidateBasePath="/interviewer/candidates"
      onBack={() => router.push("/interviewer/requisitions")}
    />
  );
}
