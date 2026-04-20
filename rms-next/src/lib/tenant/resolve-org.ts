import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { organizationMembers, organizations, requisitionItems, requisitions } from "@/lib/db/schema";

const DEFAULT_SLUG = process.env.DEFAULT_ORGANIZATION_SLUG?.trim() || "default";

function isUndefinedTableError(err: unknown, relation: string): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { cause?: { code?: string; message?: string }; code?: string; message?: string };
  const c = o.cause;
  const code = (c && typeof c === "object" && "code" in c ? c.code : o.code) as string | undefined;
  const message = String(
    (c && typeof c === "object" && "message" in c ? c.message : o.message) ?? "",
  );
  return code === "42P01" && message.includes(relation);
}

let cachedDefaultOrgId: string | null = null;

export async function resolveDefaultOrganizationId(): Promise<string> {
  if (cachedDefaultOrgId) {
    return cachedDefaultOrgId;
  }
  const db = getDb();
  try {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, DEFAULT_SLUG))
      .limit(1);
    if (!row) {
      throw new Error(
        `Default organization (slug=${DEFAULT_SLUG}) not found; run npm run db:migrate in rms-next.`,
      );
    }
    cachedDefaultOrgId = row.id;
    return row.id;
  } catch (e) {
    if (isUndefinedTableError(e, "organizations")) {
      throw new Error(
        'Table "organizations" is missing. From rms-next run: npm run db:migrate (applies 0011 repair if needed).',
      );
    }
    throw e;
  }
}

export function peekDefaultOrganizationIdFromEnv(): string | null {
  const raw = process.env.DEFAULT_ORGANIZATION_ID?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Primary membership first, else any membership, else default org row. */
export async function userBelongsToOrganization(
  userId: number,
  organizationId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ one: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row != null;
}

export async function resolveOrganizationIdForUser(userId: number): Promise<string> {
  const fromEnv = peekDefaultOrganizationIdFromEnv();
  if (fromEnv) {
    return fromEnv;
  }
  const db = getDb();
  try {
    const [primary] = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.isPrimary, true),
        ),
      )
      .limit(1);
    if (primary) {
      return primary.organizationId;
    }
    const [anyMem] = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
      .limit(1);
    if (anyMem) {
      return anyMem.organizationId;
    }
  } catch (e) {
    if (isUndefinedTableError(e, "organization_members")) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[rms-next] organization_members missing; apply migrations (npm run db:migrate). Using default org.",
        );
      }
      return resolveDefaultOrganizationId();
    }
    throw e;
  }
  return resolveDefaultOrganizationId();
}

export async function selectOrganizationIdForRequisition(
  reqId: number,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ organizationId: requisitions.organizationId })
    .from(requisitions)
    .where(eq(requisitions.reqId, reqId))
    .limit(1);
  return row?.organizationId ?? null;
}

export async function selectOrganizationIdForRequisitionItem(
  itemId: number,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ organizationId: requisitions.organizationId })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(eq(requisitionItems.itemId, itemId))
    .limit(1);
  return row?.organizationId ?? null;
}
