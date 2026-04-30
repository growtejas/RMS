import EmployeeList from "@/components/hr/EmployeeList";
import HrPageLayout from "@/components/hr/HrPageLayout";

export default function HrEmployeesPage() {
  return (
    <HrPageLayout maxWidthClass="max-w-none w-full">
      <EmployeeList />
    </HrPageLayout>
  );
}
