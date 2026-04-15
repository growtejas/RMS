import { count, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { AppDb } from "@/lib/workflow/workflow-db";
import {
  employeeAvailability,
  employeeContacts,
  employeeEducation,
  employeeFinance,
  employees,
  employeeSkills,
  companyRoles,
  skills,
} from "@/lib/db/schema";

export type EmployeeApiResponse = {
  emp_id: string;
  full_name: string;
  rbm_email: string;
  emp_status: string;
  dob: string | null;
  gender: string | null;
  doj: string | null;
  company_role_id: number | null;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function employeeRowToApi(row: typeof employees.$inferSelect): EmployeeApiResponse {
  return {
    emp_id: row.empId,
    full_name: row.fullName,
    rbm_email: row.rbmEmail,
    emp_status: row.empStatus,
    dob: row.dob ? ymd(row.dob) : null,
    gender: row.gender ?? null,
    doj: row.doj ? ymd(row.doj) : null,
    company_role_id: row.companyRoleId ?? null,
  };
}

export function formatNextEmployeeId(nextNumber: number): string {
  return `RBM-${String(nextNumber).padStart(4, "0")}`;
}

export async function computeNextEmployeeIdValue(): Promise<string> {
  const db = getDb();
  const rows = await db.select({ empId: employees.empId }).from(employees);
  const numbers = new Set<number>();
  for (const { empId } of rows) {
    const m = /\d+/.exec(empId ?? "");
    if (m) {
      const v = Number.parseInt(m[0], 10);
      if (v > 0) {
        numbers.add(v);
      }
    }
  }
  let candidate = 6;
  while (numbers.has(candidate)) {
    candidate += 1;
  }
  return formatNextEmployeeId(candidate);
}

export type EmployeeListEntry = {
  emp_id: string;
  full_name: string;
  user_id: number | null;
  emp_status: string;
  department_name: string | null;
};

export async function listEmployeesEnriched(): Promise<EmployeeListEntry[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    WITH latest_assignment AS (
      SELECT emp_id, MAX(assignment_id) AS latest_assignment_id
      FROM employee_assignments
      GROUP BY emp_id
    )
    SELECT
      e.emp_id,
      e.full_name,
      uem.user_id,
      e.emp_status,
      d.department_name
    FROM employees e
    LEFT JOIN user_employee_map uem ON uem.emp_id = e.emp_id
    LEFT JOIN latest_assignment la ON la.emp_id = e.emp_id
    LEFT JOIN employee_assignments ea ON ea.assignment_id = la.latest_assignment_id
    LEFT JOIN departments d ON d.department_id = ea.department_id
    ORDER BY e.emp_id
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    emp_id: String(r.emp_id),
    full_name: String(r.full_name),
    user_id: r.user_id != null ? Number(r.user_id) : null,
    emp_status: String(r.emp_status),
    department_name: r.department_name != null ? String(r.department_name) : null,
  }));
}

export async function findEmployeeByEmpIdDb(db: AppDb, empId: string) {
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.empId, empId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findEmployeeByEmpId(empId: string) {
  return findEmployeeByEmpIdDb(getDb(), empId);
}

export async function employeeExists(empId: string): Promise<boolean> {
  const row = await findEmployeeByEmpId(empId);
  return row != null;
}

export async function workEmailExists(workEmail: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeContacts)
    .where(eq(employeeContacts.email, workEmail))
    .limit(1);
  return rows.length > 0;
}

export async function insertEmployeeCore(values: {
  empId: string;
  fullName: string;
  rbmEmail: string;
  dob: Date | null;
  gender: string | null;
  doj: Date | null;
  empStatus?: string;
  companyRoleId?: number | null;
}) {
  const db = getDb();
  await db.insert(employees).values({
    empId: values.empId,
    fullName: values.fullName,
    rbmEmail: values.rbmEmail,
    dob: values.dob,
    gender: values.gender,
    doj: values.doj,
    empStatus: values.empStatus ?? "Onboarding",
    companyRoleId: values.companyRoleId ?? null,
  });
}

export async function updateEmployeeFields(
  empId: string,
  patch: {
    fullName?: string;
    dob?: Date | null;
    gender?: string | null;
    doj?: Date | null;
  },
) {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.fullName !== undefined) {
    set.fullName = patch.fullName;
  }
  if (patch.dob !== undefined) {
    set.dob = patch.dob;
  }
  if (patch.gender !== undefined) {
    set.gender = patch.gender;
  }
  if (patch.doj !== undefined) {
    set.doj = patch.doj;
  }
  if (Object.keys(set).length === 0) {
    return;
  }
  await db.update(employees).set(set).where(eq(employees.empId, empId));
}

export async function updateEmployeeStatus(empId: string, empStatus: string) {
  const db = getDb();
  await db
    .update(employees)
    .set({ empStatus })
    .where(eq(employees.empId, empId));
}

export async function countEmployeeSkills(empId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(employeeSkills)
    .where(eq(employeeSkills.empId, empId));
  return Number(row?.c ?? 0);
}

export async function findActiveCompanyRole(roleId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(companyRoles)
    .where(eq(companyRoles.roleId, roleId))
    .limit(1);
  const r = rows[0];
  if (!r || !r.isActive) {
    return null;
  }
  return r;
}

export async function findSkillIdsExisting(skillIds: number[]): Promise<Set<number>> {
  if (skillIds.length === 0) {
    return new Set();
  }
  const db = getDb();
  const rows = await db
    .select({ id: skills.skillId })
    .from(skills)
    .where(inArray(skills.skillId, skillIds));
  return new Set(rows.map((r) => r.id));
}

export async function runOnboardTransaction(input: {
  empId: string;
  fullName: string;
  rbmEmail: string;
  companyRoleId: number | null;
  dob: Date | null;
  gender: string | null;
  doj: Date | null;
  contacts: {
    contactType: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  }[];
  skills: {
    skillId: number;
    proficiencyLevel: string | null;
    yearsExperience: string | null;
  }[];
  education: {
    qualification: string | null;
    specialization: string | null;
    institution: string | null;
    yearCompleted: number | null;
  }[];
  availability: { availabilityPct: number; effectiveFrom: Date } | null;
  finance: { bankDetails: string | null; taxId: string | null } | null;
}) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(employees).values({
      empId: input.empId,
      fullName: input.fullName,
      rbmEmail: input.rbmEmail,
      dob: input.dob,
      gender: input.gender,
      doj: input.doj,
      empStatus: "Onboarding",
      companyRoleId: input.companyRoleId,
    });

    for (const c of input.contacts) {
      await tx.insert(employeeContacts).values({
        empId: input.empId,
        contactType: c.contactType,
        email: c.email,
        phone: c.phone,
        address: c.address,
      });
    }

    for (const s of input.skills) {
      await tx.insert(employeeSkills).values({
        empId: input.empId,
        skillId: s.skillId,
        proficiencyLevel: s.proficiencyLevel,
        yearsExperience: s.yearsExperience,
      });
    }

    for (const e of input.education) {
      await tx.insert(employeeEducation).values({
        empId: input.empId,
        qualification: e.qualification,
        specialization: e.specialization,
        institution: e.institution,
        yearCompleted: e.yearCompleted,
      });
    }

    if (input.availability) {
      await tx.insert(employeeAvailability).values({
        empId: input.empId,
        availabilityPct: input.availability.availabilityPct,
        effectiveFrom: input.availability.effectiveFrom,
      });
    }

    if (
      input.finance &&
      (input.finance.bankDetails || input.finance.taxId)
    ) {
      await tx.insert(employeeFinance).values({
        empId: input.empId,
        bankDetails: input.finance.bankDetails,
        taxId: input.finance.taxId,
      });
    }
  });
}
