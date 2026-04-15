import { cachedApiGet } from "./cached-api-get";

export interface EmployeeOption {
  emp_id: string;
  full_name: string;
  user_id?: number | null;
}

export const fetchEmployees = async (): Promise<EmployeeOption[]> => {
  return cachedApiGet<EmployeeOption[]>("/employees/employees");
};
