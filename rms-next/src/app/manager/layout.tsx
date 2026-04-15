import ManagerShell from "@/components/manager/ManagerShell";

export default function ManagerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ManagerShell>{children}</ManagerShell>;
}
