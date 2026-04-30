"use client";

import { useRouter } from "next/navigation";

import HRDashboardView from "@/components/hr/HRDashboardView";
import HrPageLayout from "@/components/hr/HrPageLayout";

export default function HrHomeDashboard() {
  const router = useRouter();
  return (
    <HrPageLayout maxWidthClass="max-w-none w-full">
      <HRDashboardView
        onViewRequisition={(reqId: number) => {
          router.push(`/hr/requisitions/${reqId}`);
        }}
      />
    </HrPageLayout>
  );
}
