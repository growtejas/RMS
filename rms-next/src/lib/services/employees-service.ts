import { HttpError } from "@/lib/http/http-error";
import * as repo from "@/lib/repositories/employees-core";
import type { EmployeeOnboardInput } from "@/lib/validators/employees";

function optDate(
  s: string | null | undefined,
  label: string,
): Date | null {
  if (s == null || s === "") {
    return null;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(422, `Invalid ${label}`);
  }
  return d;
}

export async function getNextEmployeeId() {
  const emp_id = await repo.computeNextEmployeeIdValue();
  return { emp_id };
}

export async function listEmployees() {
  return repo.listEmployeesEnriched();
}

export async function validateEmployees(
  empId: string | null,
  workEmail: string | null,
) {
  const emp_id_exists =
    empId != null && empId.trim() !== ""
      ? await repo.employeeExists(empId.trim())
      : false;
  const work_email_exists =
    workEmail != null && workEmail.trim() !== ""
      ? await repo.workEmailExists(workEmail.trim())
      : false;
  return { emp_id_exists, work_email_exists };
}

export async function getEmployee(empId: string) {
  const row = await repo.findEmployeeByEmpId(empId);
  if (!row) {
    throw new HttpError(404, "Employee not found");
  }
  return repo.employeeRowToApi(row);
}

export async function createEmployee(payload: {
  emp_id: string;
  full_name: string;
  rbm_email: string;
  dob?: string | null;
  gender?: string | null;
  doj?: string | null;
}) {
  if (await repo.employeeExists(payload.emp_id)) {
    throw new HttpError(400, "Employee already exists");
  }
  await repo.insertEmployeeCore({
    empId: payload.emp_id,
    fullName: payload.full_name,
    rbmEmail: payload.rbm_email,
    dob: optDate(payload.dob ?? null, "dob"),
    gender: payload.gender ?? null,
    doj: optDate(payload.doj ?? null, "doj"),
    empStatus: "Onboarding",
  });
  const row = await repo.findEmployeeByEmpId(payload.emp_id);
  if (!row) {
    throw new HttpError(500, "Employee not found after create");
  }
  return repo.employeeRowToApi(row);
}

export async function updateEmployee(
  empId: string,
  payload: {
    full_name?: string;
    dob?: string | null;
    gender?: string | null;
    doj?: string | null;
  },
) {
  const row = await repo.findEmployeeByEmpId(empId);
  if (!row) {
    throw new HttpError(404, "Employee not found");
  }
  const patch: Parameters<typeof repo.updateEmployeeFields>[1] = {};
  if (payload.full_name !== undefined) {
    patch.fullName = payload.full_name;
  }
  if (payload.dob !== undefined) {
    patch.dob =
      payload.dob === null || payload.dob === ""
        ? null
        : optDate(payload.dob, "dob");
  }
  if (payload.gender !== undefined) {
    patch.gender = payload.gender;
  }
  if (payload.doj !== undefined) {
    patch.doj =
      payload.doj === null || payload.doj === ""
        ? null
        : optDate(payload.doj, "doj");
  }
  await repo.updateEmployeeFields(empId, patch);
  const updated = await repo.findEmployeeByEmpId(empId);
  if (!updated) {
    throw new HttpError(404, "Employee not found");
  }
  return repo.employeeRowToApi(updated);
}

export async function patchEmployeeStatus(empId: string, empStatus: string) {
  const row = await repo.findEmployeeByEmpId(empId);
  if (!row) {
    throw new HttpError(404, "Employee not found");
  }
  await repo.updateEmployeeStatus(empId, empStatus);
  const updated = await repo.findEmployeeByEmpId(empId);
  if (!updated) {
    throw new HttpError(404, "Employee not found");
  }
  return repo.employeeRowToApi(updated);
}

export async function completeEmployeeOnboarding(empId: string) {
  const employee = await repo.findEmployeeByEmpId(empId);
  if (!employee) {
    throw new HttpError(404, "Employee not found");
  }
  if (employee.empStatus !== "Onboarding") {
    throw new HttpError(
      400,
      `Cannot complete onboarding. Employee status is '${employee.empStatus}'. Only employees with status 'Onboarding' can complete onboarding.`,
    );
  }
  const skillCount = await repo.countEmployeeSkills(empId);
  if (skillCount === 0) {
    throw new HttpError(
      400,
      "Cannot complete onboarding. At least one skill must be added to the employee profile.",
    );
  }
  await repo.updateEmployeeStatus(empId, "Active");
  const updated = await repo.findEmployeeByEmpId(empId);
  if (!updated) {
    throw new HttpError(404, "Employee not found");
  }
  return repo.employeeRowToApi(updated);
}

export async function onboardEmployee(
  payload: EmployeeOnboardInput,
): Promise<{ emp_id: string; message: string }> {
  if (await repo.employeeExists(payload.emp_id)) {
    throw new HttpError(400, "Employee ID already exists");
  }
  if (await repo.workEmailExists(payload.rbm_email)) {
    throw new HttpError(400, "Work email already exists");
  }

  let companyRoleId: number | null = null;
  if (
    payload.company_role_id != null &&
    Number.isFinite(payload.company_role_id)
  ) {
    const role = await repo.findActiveCompanyRole(payload.company_role_id);
    if (!role) {
      throw new HttpError(400, "Invalid company role");
    }
    companyRoleId = payload.company_role_id;
  }

  if (payload.contacts.length > 0) {
    const types = payload.contacts.map((c) => c.type);
    if (types.length !== new Set(types).size) {
      throw new HttpError(
        400,
        "Duplicate contact types are not allowed",
      );
    }
  }

  if (payload.skills.length > 0) {
    const skillIds = payload.skills.map((s) => s.skill_id);
    const existing = await repo.findSkillIdsExisting(skillIds);
    const missing = skillIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new HttpError(
        400,
        `Invalid skill_id(s): ${missing.join(", ")}`,
      );
    }
  }

  const contactTypeLabel: Record<string, string> = {
    work: "Work",
    personal: "Personal",
    emergency: "Emergency",
  };
  const contacts = payload.contacts.map((c) => ({
    contactType: contactTypeLabel[c.type] ?? c.type,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: c.address ?? null,
  }));

  const skillsPayload = payload.skills.map((s) => ({
    skillId: s.skill_id,
    proficiencyLevel: s.proficiency_level ?? null,
    yearsExperience:
      s.years_experience != null ? String(s.years_experience) : null,
  }));

  const education = payload.education.map((e) => ({
    qualification: e.qualification ?? null,
    specialization: e.specialization ?? null,
    institution: e.institution ?? null,
    yearCompleted: e.year_completed ?? null,
  }));

  let availability: { availabilityPct: number; effectiveFrom: Date } | null =
    null;
  if (payload.availability != null) {
    const effectiveFrom = optDate(
      payload.availability.effective_from,
      "effective_from",
    );
    if (effectiveFrom === null) {
      throw new HttpError(422, "Invalid effective_from");
    }
    availability = {
      availabilityPct: payload.availability.availability_pct,
      effectiveFrom,
    };
  }

  const finance = payload.finance
    ? {
        bankDetails: payload.finance.bank_details ?? null,
        taxId: payload.finance.tax_id ?? null,
      }
    : null;

  try {
    await repo.runOnboardTransaction({
      empId: payload.emp_id,
      fullName: payload.full_name,
      rbmEmail: payload.rbm_email,
      companyRoleId,
      dob: optDate(payload.dob ?? null, "dob"),
      gender: payload.gender ?? null,
      doj: optDate(payload.doj ?? null, "doj"),
      contacts,
      skills: skillsPayload,
      education,
      availability,
      finance,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate|violates/i.test(msg)) {
      throw new HttpError(
        400,
        `Failed to onboard employee due to a data constraint: ${msg}`,
      );
    }
    throw new HttpError(
      400,
      `Failed to onboard employee. Please verify the data: ${msg}`,
    );
  }

  return {
    emp_id: payload.emp_id,
    message: "Employee onboarded successfully",
  };
}
