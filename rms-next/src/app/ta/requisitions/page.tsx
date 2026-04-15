"use client";

import { useRouter } from "next/navigation";

import Requisitions from "@/components/ta/Requisitions";

export default function TaRequisitionsPage() {
  const router = useRouter();
  return (
    <Requisitions
      onViewRequisition={(reqId) =>
        router.push(`/ta/requisitions/${encodeURIComponent(reqId)}`)
      }
    />
  );
}
