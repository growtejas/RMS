import dynamic from "next/dynamic";

const AuditLogViewer = dynamic(() => import("@/components/admin/AuditLogViewer"), {
  ssr: false,
  loading: () => null,
});

export default function AdminAuditLogsPage() {
  return <AuditLogViewer />;
}
