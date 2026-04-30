import dynamic from "next/dynamic";

import HrPageLayout from "@/components/hr/HrPageLayout";
import Loader from "@/components/ui/Loader";

const TicketDetails = dynamic(() => import("@/components/hr/TicketDetails"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-border bg-surface p-8">
      <Loader label="Loading requisition details..." size={34} />
    </div>
  ),
});

export default function HrRequisitionDetailPage() {
  return (
    <HrPageLayout maxWidthClass="max-w-none w-full">
      <TicketDetails />
    </HrPageLayout>
  );
}
