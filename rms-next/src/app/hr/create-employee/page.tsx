import CreateEmployee from "@/components/hr/CreateEmployee";
import HrPageLayout from "@/components/hr/HrPageLayout";

export default function HrCreateEmployeePage() {
  return (
    <HrPageLayout maxWidthClass="mx-auto w-full max-w-[min(100%,90rem)]">
      <CreateEmployee />
    </HrPageLayout>
  );
}
