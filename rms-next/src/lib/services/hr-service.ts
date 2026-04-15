import { asc, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  employeeContacts,
  employeeEducation,
  employeeFinance,
  employees,
  employeeSkills,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import {
  employeeRowToApi,
  findEmployeeByEmpId,
} from "@/lib/repositories/employees-core";
import {
  findFinance,
  listContacts,
  listEducation,
  listEmployeeSkills,
} from "@/lib/repositories/employee-satellites";

export type HREmployeeProfileApi = {
  employee: ReturnType<typeof employeeRowToApi>;
  contacts: {
    emp_id: string;
    contact_type: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  }[];
  skills: {
    emp_id: string;
    skill_id: number;
    proficiency_level: string | null;
    years_experience: number | null;
  }[];
  education: {
    edu_id: number;
    emp_id: string;
    qualification: string | null;
    specialization: string | null;
    institution: string | null;
    year_completed: number | null;
  }[];
  finance: {
    emp_id: string;
    bank_details: string | null;
    tax_id: string | null;
  } | null;
};

export type SkillOverviewRow = {
  skill_id: number;
  skill_name: string;
  total_employees: number;
  proficiency: { junior: number; mid: number; senior: number };
};

function mapContact(row: typeof employeeContacts.$inferSelect) {
  return {
    emp_id: row.empId,
    contact_type: row.contactType,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
  };
}

function yearsExpToApi(v: string | null): number | null {
  if (v == null || v === "") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapSkill(row: typeof employeeSkills.$inferSelect) {
  return {
    emp_id: row.empId,
    skill_id: row.skillId,
    proficiency_level: row.proficiencyLevel ?? null,
    years_experience: yearsExpToApi(row.yearsExperience),
  };
}

function mapEducation(row: typeof employeeEducation.$inferSelect) {
  return {
    edu_id: row.eduId,
    emp_id: row.empId,
    qualification: row.qualification ?? null,
    specialization: row.specialization ?? null,
    institution: row.institution ?? null,
    year_completed: row.yearCompleted ?? null,
  };
}

function mapFinance(row: typeof employeeFinance.$inferSelect) {
  return {
    emp_id: row.empId,
    bank_details: row.bankDetails ?? null,
    tax_id: row.taxId ?? null,
  };
}

function buildProfile(
  emp: typeof employees.$inferSelect,
  contacts: ReturnType<typeof mapContact>[],
  skills: ReturnType<typeof mapSkill>[],
  education: ReturnType<typeof mapEducation>[],
  finance: ReturnType<typeof mapFinance> | null,
): HREmployeeProfileApi {
  return {
    employee: employeeRowToApi(emp),
    contacts,
    skills,
    education,
    finance,
  };
}

/** GET /api/hr/employees — batched; matches FastAPI `hr_list_employee_profiles`. */
export async function listHrEmployeeProfiles(): Promise<HREmployeeProfileApi[]> {
  const db = getDb();
  const allEmployees = await db
    .select()
    .from(employees)
    .orderBy(asc(employees.empId));

  if (allEmployees.length === 0) {
    return [];
  }

  const empIds = allEmployees.map((e) => e.empId);

  const [contacts, skillsRows, eduRows, financeRows] = await Promise.all([
    db
      .select()
      .from(employeeContacts)
      .where(inArray(employeeContacts.empId, empIds)),
    db
      .select()
      .from(employeeSkills)
      .where(inArray(employeeSkills.empId, empIds)),
    db
      .select()
      .from(employeeEducation)
      .where(inArray(employeeEducation.empId, empIds)),
    db
      .select()
      .from(employeeFinance)
      .where(inArray(employeeFinance.empId, empIds)),
  ]);

  const contactsByEmp = new Map<string, ReturnType<typeof mapContact>[]>();
  for (const c of contacts) {
    const list = contactsByEmp.get(c.empId) ?? [];
    list.push(mapContact(c));
    contactsByEmp.set(c.empId, list);
  }

  const skillsByEmp = new Map<string, ReturnType<typeof mapSkill>[]>();
  for (const s of skillsRows) {
    const list = skillsByEmp.get(s.empId) ?? [];
    list.push(mapSkill(s));
    skillsByEmp.set(s.empId, list);
  }

  const eduByEmp = new Map<string, ReturnType<typeof mapEducation>[]>();
  for (const e of eduRows) {
    const list = eduByEmp.get(e.empId) ?? [];
    list.push(mapEducation(e));
    eduByEmp.set(e.empId, list);
  }

  const financeByEmp = new Map<string, ReturnType<typeof mapFinance>>();
  for (const f of financeRows) {
    financeByEmp.set(f.empId, mapFinance(f));
  }

  return allEmployees.map((emp) =>
    buildProfile(
      emp,
      contactsByEmp.get(emp.empId) ?? [],
      skillsByEmp.get(emp.empId) ?? [],
      eduByEmp.get(emp.empId) ?? [],
      financeByEmp.get(emp.empId) ?? null,
    ),
  );
}

/** GET /api/hr/employees/{emp_id} — matches FastAPI `hr_get_employee_profile`. */
export async function getHrEmployeeProfile(
  empId: string,
): Promise<HREmployeeProfileApi> {
  const emp = await findEmployeeByEmpId(empId);
  if (!emp) {
    throw new HttpError(404, "Employee not found");
  }

  const [contacts, skills, education, financeRow] = await Promise.all([
    listContacts(empId),
    listEmployeeSkills(empId),
    listEducation(empId),
    findFinance(empId),
  ]);

  return buildProfile(
    emp,
    contacts.map(mapContact),
    skills.map(mapSkill),
    education.map(mapEducation),
    financeRow ? mapFinance(financeRow) : null,
  );
}

/** GET /api/hr/skills-summary — matches FastAPI `hr_skills_summary`. */
export async function listHrSkillsSummary(): Promise<SkillOverviewRow[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT
      s.skill_id AS skill_id,
      s.skill_name AS skill_name,
      COUNT(DISTINCT es.emp_id)::int AS total_employees,
      COALESCE(
        SUM(CASE WHEN es.proficiency_level = 'Junior' THEN 1 ELSE 0 END),
        0
      )::int AS junior,
      COALESCE(
        SUM(CASE WHEN es.proficiency_level = 'Mid' THEN 1 ELSE 0 END),
        0
      )::int AS mid,
      COALESCE(
        SUM(CASE WHEN es.proficiency_level = 'Senior' THEN 1 ELSE 0 END),
        0
      )::int AS senior
    FROM skills s
    LEFT JOIN employee_skills es ON es.skill_id = s.skill_id
    GROUP BY s.skill_id, s.skill_name
    ORDER BY s.skill_name
  `);

  const out: SkillOverviewRow[] = [];
  for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
    out.push({
      skill_id: Number(r.skill_id),
      skill_name: String(r.skill_name),
      total_employees: Number(r.total_employees ?? 0),
      proficiency: {
        junior: Number(r.junior ?? 0),
        mid: Number(r.mid ?? 0),
        senior: Number(r.senior ?? 0),
      },
    });
  }
  return out;
}
