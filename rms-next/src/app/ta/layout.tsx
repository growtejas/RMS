import TaShell from "@/components/ta/TaShell";

export default function TaAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TaShell>{children}</TaShell>;
}
