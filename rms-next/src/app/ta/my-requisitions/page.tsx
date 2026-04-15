"use client";

import { useRouter } from "next/navigation";

import MyRequisitions from "@/components/ta/MyRequisitions";

export default function TaMyRequisitionsPage() {
  const router = useRouter();
  return (
    <MyRequisitions
      onViewRequisition={(reqId) =>
        router.push(`/ta/requisitions/${encodeURIComponent(reqId)}`)
      }
    />
  );
}
