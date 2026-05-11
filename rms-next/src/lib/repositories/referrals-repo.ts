/**
 * Referrals — read-only list view over `candidates` filtered by `is_referral`.
 *
 * Today the RMS data model treats referrals as a flag on the candidate row
 * (`candidates.is_referral`), not a separate table. This module exposes a
 * narrow, paginated list helper so the canonical Referrals screen can render
 * a real domain list instead of synthesising one from the candidates roster.
 */

import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { getReadDb } from "@/lib/db";
import { candidates } from "@/lib/db/schema";

export type ReferralRow = typeof candidates.$inferSelect;

export interface ReferralListFilters {
  organizationId: string;
  /** Case-insensitive match across name, email, and current company. */
  searchQuery?: string | null;
}

function buildConds(filters: ReferralListFilters): SQL[] {
  const conds: SQL[] = [
    eq(candidates.organizationId, filters.organizationId),
    eq(candidates.isReferral, true),
  ];
  const q = filters.searchQuery?.trim();
  if (q) {
    const pat = `%${q}%`;
    const orCond = or(
      ilike(candidates.fullName, pat),
      ilike(candidates.email, pat),
      ilike(candidates.currentCompany, pat),
    );
    if (orCond) conds.push(orCond);
  }
  return conds;
}

export async function selectReferralsPaged(args: {
  filters: ReferralListFilters;
  limit: number;
  offset: number;
}): Promise<ReferralRow[]> {
  const db = getReadDb();
  const conds = buildConds(args.filters);
  return db
    .select()
    .from(candidates)
    .where(and(...conds))
    .orderBy(desc(candidates.createdAt))
    .limit(args.limit)
    .offset(args.offset);
}

export async function countReferrals(
  filters: ReferralListFilters,
): Promise<number> {
  const db = getReadDb();
  const conds = buildConds(filters);
  const [row] = await db
    .select({ n: count() })
    .from(candidates)
    .where(and(...conds));
  return Number(row?.n ?? 0);
}
