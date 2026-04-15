import { desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { employeeAssignments, employees } from "@/lib/db/schema";

export type AssignmentApiRow = {
  assignment_id: number;
  emp_id: string;
  department_id: number;
  manager_id: string | null;
  location_id: number | null;
  start_date: string;
  end_date: string | null;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toApiRow(row: {
  assignmentId: number;
  empId: string;
  departmentId: number;
  managerId: string | null;
  locationId: number | null;
  startDate: Date;
  endDate: Date | null;
}): AssignmentApiRow {
  return {
    assignment_id: row.assignmentId,
    emp_id: row.empId,
    department_id: row.departmentId,
    manager_id: row.managerId,
    location_id: row.locationId,
    start_date: ymd(row.startDate),
    end_date: row.endDate ? ymd(row.endDate) : null,
  };
}

export async function findEmployeeByEmpId(empId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.empId, empId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAssignmentsForEmployee(
  empId: string,
): Promise<AssignmentApiRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeAssignments)
    .where(eq(employeeAssignments.empId, empId))
    .orderBy(desc(employeeAssignments.startDate));
  return rows.map(toApiRow);
}

export async function insertAssignment(params: {
  empId: string;
  departmentId: number;
  managerId: string | null;
  locationId: number | null;
  startDate: Date;
  endDate: Date | null;
}): Promise<AssignmentApiRow> {
  const db = getDb();
  const inserted = await db
    .insert(employeeAssignments)
    .values({
      empId: params.empId,
      departmentId: params.departmentId,
      managerId: params.managerId,
      locationId: params.locationId,
      startDate: params.startDate,
      endDate: params.endDate,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("Assignment insert failed");
  }
  return toApiRow(row);
}

export async function findAssignmentById(assignmentId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeAssignments)
    .where(eq(employeeAssignments.assignmentId, assignmentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateAssignmentEndDate(
  assignmentId: number,
  endDate: Date,
): Promise<AssignmentApiRow> {
  const db = getDb();
  await db
    .update(employeeAssignments)
    .set({ endDate })
    .where(eq(employeeAssignments.assignmentId, assignmentId));
  const row = await findAssignmentById(assignmentId);
  if (!row) {
    throw new Error("Assignment not found after update");
  }
  return toApiRow(row);
}
