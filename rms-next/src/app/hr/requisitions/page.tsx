import HrTickets from "@/components/hr/HrTickets";
import HrPageLayout from "@/components/hr/HrPageLayout";

export default function HrRequisitionsPage() {
  return (
    <HrPageLayout maxWidthClass="max-w-none w-full">
      <HrTickets />
    </HrPageLayout>
  );
}
