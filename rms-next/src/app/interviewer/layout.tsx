import InterviewerShell from "@/components/interviewer/InterviewerShell";

export default function InterviewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <InterviewerShell>{children}</InterviewerShell>;
}
