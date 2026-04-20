import { count, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { applications } from "@/lib/db/schema";

/** Stage counts for funnel visualization / export. */
export async function getAtsFunnelForOrganization(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select({
      stage: applications.currentStage,
      c: count(),
    })
    .from(applications)
    .where(eq(applications.organizationId, organizationId))
    .groupBy(applications.currentStage);
  return rows.map((r) => ({
    stage: r.stage,
    count: Number(r.c ?? 0),
  }));
}
