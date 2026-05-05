"use client";

import RequisitionDetail from "@/components/ta/RequisitionDetail";
import { useRouter } from "next/navigation";

// Static import avoids dev lazy-chunk URLs like `/_next/undefined` (dynamic + ssr:false).
export default function TaRequisitionDetailPage() {
  const router = useRouter();
  return <RequisitionDetail onBack={() => router.back()} />;
}
