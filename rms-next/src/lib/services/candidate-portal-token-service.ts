import { createHash, randomBytes } from "node:crypto";

import { getDb } from "@/lib/db";
import { candidatePortalTokens } from "@/lib/db/schema";
import { assertApplicationInOrganization } from "@/lib/tenant/org-assert";
import { eq } from "drizzle-orm";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function issueCandidatePortalToken(params: {
  applicationId: number;
  organizationId: string;
  ttlHours?: number;
}) {
  await assertApplicationInOrganization(params.applicationId, params.organizationId);
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const hours = params.ttlHours ?? 72;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  const db = getDb();
  await db.insert(candidatePortalTokens).values({
    tokenHash,
    applicationId: params.applicationId,
    expiresAt,
  });
  return { token: raw, expires_at: expiresAt.toISOString() };
}

export async function resolvePortalApplication(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const db = getDb();
  const [row] = await db
    .select()
    .from(candidatePortalTokens)
    .where(eq(candidatePortalTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return { applicationId: row.applicationId };
}
