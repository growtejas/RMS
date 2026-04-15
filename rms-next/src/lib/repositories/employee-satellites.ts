import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  employeeAvailability,
  employeeContacts,
  employeeEducation,
  employeeFinance,
  employeeSkills,
  skills,
} from "@/lib/db/schema";

export async function findSkillById(skillId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(eq(skills.skillId, skillId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listContacts(empId: string) {
  const db = getDb();
  return db
    .select()
    .from(employeeContacts)
    .where(eq(employeeContacts.empId, empId));
}

export async function findContact(empId: string, contactType: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeContacts)
    .where(
      and(
        eq(employeeContacts.empId, empId),
        eq(employeeContacts.contactType, contactType),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertContact(values: {
  empId: string;
  contactType: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}) {
  const db = getDb();
  await db.insert(employeeContacts).values({
    empId: values.empId,
    contactType: values.contactType,
    email: values.email,
    phone: values.phone,
    address: values.address,
  });
}

export async function updateContact(
  empId: string,
  contactType: string,
  patch: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  },
) {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.email !== undefined) {
    set.email = patch.email;
  }
  if (patch.phone !== undefined) {
    set.phone = patch.phone;
  }
  if (patch.address !== undefined) {
    set.address = patch.address;
  }
  if (Object.keys(set).length === 0) {
    return;
  }
  await db
    .update(employeeContacts)
    .set(set)
    .where(
      and(
        eq(employeeContacts.empId, empId),
        eq(employeeContacts.contactType, contactType),
      ),
    );
}

export async function deleteContact(empId: string, contactType: string) {
  const db = getDb();
  await db
    .delete(employeeContacts)
    .where(
      and(
        eq(employeeContacts.empId, empId),
        eq(employeeContacts.contactType, contactType),
      ),
    );
}

export async function listEmployeeSkills(empId: string) {
  const db = getDb();
  return db
    .select()
    .from(employeeSkills)
    .where(eq(employeeSkills.empId, empId));
}

export async function findEmployeeSkill(empId: string, skillId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeSkills)
    .where(
      and(
        eq(employeeSkills.empId, empId),
        eq(employeeSkills.skillId, skillId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertEmployeeSkill(values: {
  empId: string;
  skillId: number;
  proficiencyLevel: string | null;
  yearsExperience: string | null;
}) {
  const db = getDb();
  await db.insert(employeeSkills).values({
    empId: values.empId,
    skillId: values.skillId,
    proficiencyLevel: values.proficiencyLevel,
    yearsExperience: values.yearsExperience,
  });
}

export async function updateEmployeeSkill(
  empId: string,
  skillId: number,
  patch: { proficiencyLevel?: string | null; yearsExperience?: string | null },
) {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.proficiencyLevel !== undefined) {
    set.proficiencyLevel = patch.proficiencyLevel;
  }
  if (patch.yearsExperience !== undefined) {
    set.yearsExperience = patch.yearsExperience;
  }
  if (Object.keys(set).length === 0) {
    return;
  }
  await db
    .update(employeeSkills)
    .set(set)
    .where(
      and(
        eq(employeeSkills.empId, empId),
        eq(employeeSkills.skillId, skillId),
      ),
    );
}

export async function deleteEmployeeSkill(empId: string, skillId: number) {
  const db = getDb();
  await db
    .delete(employeeSkills)
    .where(
      and(
        eq(employeeSkills.empId, empId),
        eq(employeeSkills.skillId, skillId),
      ),
    );
}

export async function listEducation(empId: string) {
  const db = getDb();
  return db
    .select()
    .from(employeeEducation)
    .where(eq(employeeEducation.empId, empId))
    .orderBy(desc(employeeEducation.yearCompleted));
}

export async function findEducation(empId: string, eduId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeEducation)
    .where(
      and(
        eq(employeeEducation.eduId, eduId),
        eq(employeeEducation.empId, empId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertEducation(values: {
  empId: string;
  qualification: string | null;
  specialization: string | null;
  institution: string | null;
  yearCompleted: number | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(employeeEducation)
    .values({
      empId: values.empId,
      qualification: values.qualification,
      specialization: values.specialization,
      institution: values.institution,
      yearCompleted: values.yearCompleted,
    })
    .returning();
  return row ?? null;
}

export async function updateEducationRecord(
  empId: string,
  eduId: number,
  patch: {
    qualification?: string;
    specialization?: string | null;
    institution?: string | null;
    yearCompleted?: number | null;
  },
) {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.qualification !== undefined) {
    set.qualification = patch.qualification;
  }
  if (patch.specialization !== undefined) {
    set.specialization = patch.specialization;
  }
  if (patch.institution !== undefined) {
    set.institution = patch.institution;
  }
  if (patch.yearCompleted !== undefined) {
    set.yearCompleted = patch.yearCompleted;
  }
  if (Object.keys(set).length === 0) {
    return;
  }
  await db
    .update(employeeEducation)
    .set(set)
    .where(
      and(
        eq(employeeEducation.eduId, eduId),
        eq(employeeEducation.empId, empId),
      ),
    );
}

export async function deleteEducationRecord(empId: string, eduId: number) {
  const db = getDb();
  await db
    .delete(employeeEducation)
    .where(
      and(
        eq(employeeEducation.eduId, eduId),
        eq(employeeEducation.empId, empId),
      ),
    );
}

export async function findFinance(empId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeFinance)
    .where(eq(employeeFinance.empId, empId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertFinanceRecord(
  empId: string,
  bankDetails: string | null,
  taxId: string | null,
) {
  const db = getDb();
  const existing = await findFinance(empId);
  if (existing) {
    await db
      .update(employeeFinance)
      .set({ bankDetails, taxId })
      .where(eq(employeeFinance.empId, empId));
  } else {
    await db.insert(employeeFinance).values({
      empId,
      bankDetails,
      taxId,
    });
  }
}

export async function listAvailability(empId: string) {
  const db = getDb();
  return db
    .select()
    .from(employeeAvailability)
    .where(eq(employeeAvailability.empId, empId))
    .orderBy(asc(employeeAvailability.effectiveFrom));
}

export async function findAvailabilityOnDate(empId: string, effectiveFrom: Date) {
  const db = getDb();
  const rows = await db
    .select()
    .from(employeeAvailability)
    .where(
      and(
        eq(employeeAvailability.empId, empId),
        eq(employeeAvailability.effectiveFrom, effectiveFrom),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertAvailability(values: {
  empId: string;
  availabilityPct: number;
  effectiveFrom: Date;
}) {
  const db = getDb();
  await db.insert(employeeAvailability).values({
    empId: values.empId,
    availabilityPct: values.availabilityPct,
    effectiveFrom: values.effectiveFrom,
  });
}
