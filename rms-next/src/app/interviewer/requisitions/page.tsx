"use client";

import { useRouter } from "next/navigation";
import Requisitions from "@/components/ta/Requisitions";

export default function InterviewerRequisitionsPage() {
  const router = useRouter();

  return (
    <Requisitions
      readOnly
      onViewRequisition={(reqId) => {
        const numeric = reqId.replace("REQ-", "");
        router.push(`/interviewer/requisitions/${encodeURIComponent(numeric)}`);
      }}
    />
  );
}
