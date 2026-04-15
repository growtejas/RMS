import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { employees } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";
import type { AppDb } from "@/lib/workflow/workflow-db";

export function generateEmpIdForOnboarding(): string {
  return `EMP${randomBytes(9).toString("hex").slice(0, 17)}`;
}

/** Port of `create_employee_from_candidate` in `backend/services/onboarding.py`. */
export async function createEmployeeFromCandidateDb(
  db: AppDb,
  candidate: { candidateId: number; fullName: string; email: string },
): Promise<string> {
  const empId = generateEmpIdForOnboarding();
  let rbmEmail =
    (candidate.email || "").trim() ||
    `onboarding-${candidate.candidateId}@placeholder.local`;

  const [existing] = await db
    .select()
    .from(employees)
    .where(eq(employees.rbmEmail, rbmEmail))
    .limit(1);
  if (existing) {
    rbmEmail = `onboarding-${candidate.candidateId}-${randomBytes(4).toString("hex")}@placeholder.local`;
  }

  let fullName = (candidate.fullName || "").trim() || "Unknown";
  if (fullName.length > 100) {
    fullName = fullName.slice(0, 100);
  }

  try {
    await db.insert(employees).values({
      empId,
      fullName,
      rbmEmail,
      empStatus: "Onboarding",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      throw new HttpError(409, "Could not allocate unique employee email");
    }
    throw e;
  }
  return empId;
}
