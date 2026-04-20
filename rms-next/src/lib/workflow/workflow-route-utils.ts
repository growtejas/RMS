import type { AppDb } from "@/lib/workflow/workflow-db";
import { assertRequisitionItemInOrganization } from "@/lib/tenant/org-assert";

export function asAppDb(tx: unknown): AppDb {
  return tx as AppDb;
}

export async function requireItemInOrganization(
  itemId: number,
  organizationId: string,
): Promise<void> {
  await assertRequisitionItemInOrganization(itemId, organizationId);
}
