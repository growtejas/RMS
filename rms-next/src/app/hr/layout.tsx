import HrShell from "@/components/hr/HrShell";

export default function HrAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <HrShell>{children}</HrShell>;
}
