"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const RequisitionDetail = dynamic(
  () => import("@/components/ta/RequisitionDetail"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          padding: "48px",
          textAlign: "center",
          color: "#64748b",
          fontSize: "14px",
        }}
      >
        Loading requisition…
      </div>
    ),
  },
);

export default function TaRequisitionDetailPage() {
  const router = useRouter();
  return <RequisitionDetail onBack={() => router.back()} />;
}
