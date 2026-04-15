import dynamic from "next/dynamic";

const TicketDetails = dynamic(() => import("@/components/hr/TicketDetails"), {
  ssr: false,
  loading: () => null,
});

export default function HrRequisitionDetailPage() {
  return <TicketDetails />;
}
