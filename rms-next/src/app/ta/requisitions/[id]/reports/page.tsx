import { notFound } from "next/navigation";

import { RequisitionReports } from "@/components/ta/reports/hiring-intelligence/RequisitionReports";

interface PageProps {
  params: { id: string };
}

export default function TaRequisitionReportsPage({ params }: PageProps) {
  const requisitionId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(requisitionId) || requisitionId <= 0) notFound();
  return (
    <div className="p-4">
      <RequisitionReports requisitionId={requisitionId} />
    </div>
  );
}
