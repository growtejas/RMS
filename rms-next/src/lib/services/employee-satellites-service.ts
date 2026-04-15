import { HttpError } from "@/lib/http/http-error";
import { findEmployeeByEmpId } from "@/lib/repositories/employees-core";
import * as repo from "@/lib/repositories/employee-satellites";
import type {
  EmployeeAvailabilityCreateInput,
  EmployeeContactUpsertInput,
  EmployeeEducationCreateInput,
  EmployeeEducationUpdateInput,
  EmployeeFinanceUpsertInput,
  EmployeeSkillUpsertInput,
} from "@/lib/validators/employee-satellites";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseEffectiveDate(s: string, label: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(422, `Invalid ${label}`);
  }
  return d;
}

function yearsToApi(v: string | null | undefined): number | null {
  if (v == null || v === "") {
    return null;
  }
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function contactToApi(row: {
  empId: string;
  contactType: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}) {
  return {
    emp_id: row.empId,
    contact_type: row.contactType,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
  };
}

function mapSkill(row: NonNullable<Awaited<ReturnType<typeof repo.findEmployeeSkill>>>) {
  return {
    emp_id: row.empId,
    skill_id: row.skillId,
    proficiency_level: row.proficiencyLevel ?? null,
    years_experience: yearsToApi(row.yearsExperience as string | null),
  };
}

function mapEducation(
  row: NonNullable<Awaited<ReturnType<typeof repo.findEducation>>>,
) {
  return {
    edu_id: row.eduId,
    emp_id: row.empId,
    qualification: row.qualification ?? "",
    specialization: row.specialization ?? null,
    institution: row.institution ?? null,
    year_completed: row.yearCompleted ?? null,
  };
}

export async function listContactsApi(empId: string) {
  const rows = await repo.listContacts(empId);
  return rows.map((r) => contactToApi(r));
}

export async function upsertContactApi(
  empId: string,
  payload: EmployeeContactUpsertInput,
) {
  const employee = await findEmployeeByEmpId(empId);
  if (!employee) {
    throw new HttpError(404, "Employee not found");
  }

  const existing = await repo.findContact(empId, payload.contact_type);
  if (existing) {
    const patch: {
      email?: string | null;
      phone?: string | null;
      address?: string | null;
    } = {};
    if (payload.email !== undefined && payload.email !== null) {
      patch.email = payload.email;
    }
    if (payload.phone !== undefined && payload.phone !== null) {
      patch.phone = payload.phone;
    }
    if (payload.address !== undefined && payload.address !== null) {
      patch.address = payload.address;
    }
    await repo.updateContact(empId, payload.contact_type, patch);
  } else {
    await repo.insertContact({
      empId,
      contactType: payload.contact_type,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
    });
  }

  const row = await repo.findContact(empId, payload.contact_type);
  if (!row) {
    throw new HttpError(500, "Contact not found after upsert");
  }
  return contactToApi(row);
}

export async function getContactApi(empId: string, contactType: string) {
  const row = await repo.findContact(empId, contactType);
  if (!row) {
    throw new HttpError(404, "Contact not found");
  }
  return contactToApi(row);
}

export async function deleteContactApi(empId: string, contactType: string) {
  const row = await repo.findContact(empId, contactType);
  if (!row) {
    throw new HttpError(404, "Contact not found");
  }
  await repo.deleteContact(empId, contactType);
  return { message: "Contact deleted successfully" };
}

export async function listSkillsApi(empId: string) {
  const rows = await repo.listEmployeeSkills(empId);
  return rows.map((r) => mapSkill(r));
}

export async function upsertSkillApi(
  empId: string,
  payload: EmployeeSkillUpsertInput,
) {
  const employee = await findEmployeeByEmpId(empId);
  if (!employee) {
    throw new HttpError(404, "Employee not found");
  }
  const skill = await repo.findSkillById(payload.skill_id);
  if (!skill) {
    throw new HttpError(404, "Skill not found");
  }

  const record = await repo.findEmployeeSkill(empId, payload.skill_id);
  if (record) {
    const patch: {
      proficiencyLevel?: string | null;
      yearsExperience?: string | null;
    } = {};
    if (
      payload.proficiency_level !== undefined &&
      payload.proficiency_level !== null
    ) {
      patch.proficiencyLevel = payload.proficiency_level;
    }
    if (
      payload.years_experience !== undefined &&
      payload.years_experience !== null
    ) {
      patch.yearsExperience = String(payload.years_experience);
    }
    await repo.updateEmployeeSkill(empId, payload.skill_id, patch);
  } else {
    await repo.insertEmployeeSkill({
      empId,
      skillId: payload.skill_id,
      proficiencyLevel: payload.proficiency_level ?? null,
      yearsExperience:
        payload.years_experience != null
          ? String(payload.years_experience)
          : null,
    });
  }

  const updated = await repo.findEmployeeSkill(empId, payload.skill_id);
  if (!updated) {
    throw new HttpError(500, "Skill row missing after upsert");
  }
  return mapSkill(updated);
}

export async function deleteSkillApi(empId: string, skillId: number) {
  const record = await repo.findEmployeeSkill(empId, skillId);
  if (!record) {
    throw new HttpError(404, "Skill not assigned");
  }
  await repo.deleteEmployeeSkill(empId, skillId);
  return { message: "Skill removed from employee" };
}

export async function listEducationApi(empId: string) {
  const rows = await repo.listEducation(empId);
  return rows.map((r) => mapEducation(r));
}

export async function addEducationApi(
  empId: string,
  payload: EmployeeEducationCreateInput,
) {
  const row = await repo.insertEducation({
    empId,
    qualification: payload.qualification,
    specialization: payload.specialization ?? null,
    institution: payload.institution ?? null,
    yearCompleted: payload.year_completed ?? null,
  });
  if (!row) {
    throw new HttpError(500, "Education insert failed");
  }
  return mapEducation(row);
}

export async function updateEducationApi(
  empId: string,
  eduId: number,
  payload: EmployeeEducationUpdateInput,
) {
  const record = await repo.findEducation(empId, eduId);
  if (!record) {
    throw new HttpError(404, "Education record not found");
  }
  await repo.updateEducationRecord(empId, eduId, {
    qualification: payload.qualification,
    specialization: payload.specialization,
    institution: payload.institution,
    yearCompleted: payload.year_completed,
  });
  const updated = await repo.findEducation(empId, eduId);
  if (!updated) {
    throw new HttpError(404, "Education record not found");
  }
  return mapEducation(updated);
}

export async function deleteEducationApi(empId: string, eduId: number) {
  const record = await repo.findEducation(empId, eduId);
  if (!record) {
    throw new HttpError(404, "Education record not found");
  }
  await repo.deleteEducationRecord(empId, eduId);
  return { message: "Education record deleted successfully" };
}

export async function getFinanceApi(empId: string) {
  const row = await repo.findFinance(empId);
  if (!row) {
    return {
      emp_id: empId,
      bank_details: null as string | null,
      tax_id: null as string | null,
    };
  }
  return {
    emp_id: row.empId,
    bank_details: row.bankDetails ?? null,
    tax_id: row.taxId ?? null,
  };
}

export async function upsertFinanceApi(
  empId: string,
  payload: EmployeeFinanceUpsertInput,
) {
  await repo.upsertFinanceRecord(
    empId,
    payload.bank_details ?? null,
    payload.tax_id ?? null,
  );
  return getFinanceApi(empId);
}

export async function addAvailabilityApi(
  empId: string,
  payload: EmployeeAvailabilityCreateInput,
) {
  const employee = await findEmployeeByEmpId(empId);
  if (!employee) {
    throw new HttpError(404, "Employee not found");
  }
  const effectiveFrom = parseEffectiveDate(
    payload.effective_from,
    "effective_from",
  );
  const dup = await repo.findAvailabilityOnDate(empId, effectiveFrom);
  if (dup) {
    throw new HttpError(400, "Availability already exists for this date");
  }
  await repo.insertAvailability({
    empId,
    availabilityPct: payload.availability_pct,
    effectiveFrom,
  });
  return { message: "Availability added successfully" };
}

export async function listAvailabilityApi(empId: string) {
  const rows = await repo.listAvailability(empId);
  return rows.map((r) => ({
    emp_id: r.empId,
    availability_pct: r.availabilityPct,
    effective_from: ymd(r.effectiveFrom),
  }));
}
