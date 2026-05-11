import dynamic from "next/dynamic";

const BulkOperationHistory = dynamic(
  () => import("@/components/admin/BulkOperationHistory"),
  {
    ssr: false,
    loading: () => null,
  },
);

export default function AdminBulkOperationsPage() {
  return <BulkOperationHistory />;
}
