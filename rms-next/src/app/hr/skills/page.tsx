import SkillsOverview from "@/components/hr/SkillsOverview";
import HrPageLayout from "@/components/hr/HrPageLayout";

export default function HrSkillsPage() {
  return (
    <HrPageLayout maxWidthClass="max-w-none w-full">
      <SkillsOverview />
    </HrPageLayout>
  );
}
