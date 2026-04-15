import { HttpError } from "@/lib/http/http-error";
import * as repo from "@/lib/repositories/org-assignments";

function parseDateOnly(raw: string, label: string): Date {
  const s = raw.trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(422, `Invalid ${label}`);
  }
  return d;
}

export async function createAssignment(
  empId: string,
  body: {
    department_id: number;
    manager_id?: string | null;
    location_id?: number | null;
    start_date: string;
    end_date?: string | null;
  },
) {
  const emp = await repo.findEmployeeByEmpId(empId);
  if (!emp) {
    throw new HttpError(404, "Employee not found");
  }

  const startDate = parseDateOnly(body.start_date, "start_date");
  let endDate: Date | null = null;
  if (body.end_date != null && body.end_date.trim() !== "") {
    endDate = parseDateOnly(body.end_date, "end_date");
  }

  const managerId =
    body.manager_id != null && body.manager_id !== ""
      ? body.manager_id
      : null;

  return repo.insertAssignment({
    empId,
    departmentId: body.department_id,
    managerId,
    locationId: body.location_id ?? null,
    startDate,
    endDate,
  });
}

export async function listAssignments(empId: string) {
  /** Matches FastAPI: no employee existence check; may return []. */
  return repo.listAssignmentsForEmployee(empId);
}

export async function endAssignment(assignmentId: number, endDateRaw: string) {
  const assignment = await repo.findAssignmentById(assignmentId);
  if (!assignment) {
    throw new HttpError(404, "Assignment not found");
  }
  if (assignment.endDate) {
    throw new HttpError(400, "Assignment already closed");
  }
  const endDate = parseDateOnly(endDateRaw, "end_date");
  const start = assignment.startDate;
  if (endDate < start) {
    throw new HttpError(400, "End date cannot be before start date");
  }
  return repo.updateAssignmentEndDate(assignmentId, endDate);
}
