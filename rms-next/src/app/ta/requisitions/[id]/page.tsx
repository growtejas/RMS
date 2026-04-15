"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const RequisitionDetail = dynamic(
  () => import("@/components/ta/RequisitionDetail"),
  { ssr: false, loading: () => null },
);

export default function TaRequisitionDetailPage() {
  const router = useRouter();
  return <RequisitionDetail onBack={() => router.back()} />;
}
