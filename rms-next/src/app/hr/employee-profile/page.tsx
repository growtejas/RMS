import EmployeeProfile from "@/components/hr/EmployeeProfile";
import HrPageLayout from "@/components/hr/HrPageLayout";

export default function HrEmployeeProfilePage() {
  return (
    <HrPageLayout maxWidthClass="max-w-none w-full">
      <EmployeeProfile />
    </HrPageLayout>
  );
}
