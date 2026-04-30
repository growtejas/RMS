import { cachedApiGet } from "@/lib/api/cached-api-get";

interface EmployeeListEntry {
  emp_id: string;
  full_name: string;
  user_id?: number | null;
}

interface EmployeeDetail {
  emp_id: string;
  full_name: string;
  rbm_email: string;
  emp_status: string;
}

interface EmployeeSkillEntry {
  skill_id: number;
  emp_id: string;
}

interface AssignmentEntry {
  assignment_id: number;
  department_id: number;
  start_date: string;
  end_date?: string | null;
}

interface DepartmentEntry {
  department_id: number;
  department_name: string;
}

export interface HrEmployeeListRow {
  empId: string;
  name: string;
  status: string;
  department: string;
  skillsCount: number;
  profileComplete?: number | null;
}

/**
 * Full employee list enrichment (same behavior as legacy EmployeeList useEffect fetch).
 */
export async function fetchHrEmployeeListRows(
  signal?: AbortSignal,
): Promise<HrEmployeeListRow[]> {
  const [employeesResponse, departmentsResponse] = await Promise.all([
    cachedApiGet<EmployeeListEntry[]>("/employees/employees", { signal }),
    cachedApiGet<DepartmentEntry[]>("/departments/", { signal }),
  ]);

  const departmentsById = new Map(
    (departmentsResponse ?? []).map((dept) => [
      dept.department_id,
      dept.department_name,
    ]),
  );

  const list = employeesResponse ?? [];

  const rows = await Promise.all(
    list.map(async (emp) => {
      const [detail, skillsRows, assignments] = await Promise.all([
        cachedApiGet<EmployeeDetail>(`/employees/${emp.emp_id}`, { signal }),
        cachedApiGet<EmployeeSkillEntry[]>(
          `/employees/${emp.emp_id}/skills/`,
          { signal },
        ),
        cachedApiGet<AssignmentEntry[]>(
          `/employees/${emp.emp_id}/assignments`,
          { signal },
        ),
      ]);

      const assignmentList = assignments ?? [];
      const latestAssignment = assignmentList[0];
      const departmentName = latestAssignment?.department_id
        ? (departmentsById.get(latestAssignment.department_id) ?? "—")
        : "—";

      const skillsCount = skillsRows?.length ?? 0;

      return {
        empId: detail.emp_id,
        name: detail.full_name,
        status: detail.emp_status ?? "—",
        department: departmentName,
        skillsCount,
        profileComplete: null,
      } satisfies HrEmployeeListRow;
    }),
  );

  return rows;
}
