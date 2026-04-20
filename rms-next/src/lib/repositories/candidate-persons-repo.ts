import { and, eq } from "drizzle-orm";

import { candidatePersons } from "@/lib/db/schema";
import type { AppDb } from "@/lib/workflow/workflow-db";

/**
 * Resolve org + normalized email to a person row, creating one if needed.
 * Updates canonical name/phone on the person when the row already exists.
 */
export async function findOrCreatePersonTx(
  tx: AppDb,
  params: {
    organizationId: string;
    emailNormalized: string;
    fullName: string;
    phone: string | null;
  },
): Promise<number> {
  const [existing] = await tx
    .select({ personId: candidatePersons.personId })
    .from(candidatePersons)
    .where(
      and(
        eq(candidatePersons.organizationId, params.organizationId),
        eq(candidatePersons.emailNormalized, params.emailNormalized),
      ),
    )
    .limit(1);
  if (existing) {
    await tx
      .update(candidatePersons)
      .set({
        fullName: params.fullName,
        phone: params.phone,
        updatedAt: new Date(),
      })
      .where(eq(candidatePersons.personId, existing.personId));
    return existing.personId;
  }
  const [created] = await tx
    .insert(candidatePersons)
    .values({
      organizationId: params.organizationId,
      emailNormalized: params.emailNormalized,
      fullName: params.fullName,
      phone: params.phone,
    })
    .returning({ personId: candidatePersons.personId });
  if (!created) {
    throw new Error("candidate_persons insert failed");
  }
  return created.personId;
}
