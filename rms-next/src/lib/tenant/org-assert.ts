import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  applications,
  candidates,
  requisitionItems,
  requisitions,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-error";

export async function assertRequisitionItemInOrganization(
  itemId: number,
  organizationId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ one: requisitionItems.itemId })
    .from(requisitionItems)
    .innerJoin(requisitions, eq(requisitionItems.reqId, requisitions.reqId))
    .where(
      and(
        eq(requisitionItems.itemId, itemId),
        eq(requisitions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(404, "Requisition item not found");
  }
}

export async function assertRequisitionInOrganization(
  reqId: number,
  organizationId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ one: requisitions.reqId })
    .from(requisitions)
    .where(
      and(eq(requisitions.reqId, reqId), eq(requisitions.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(404, "Requisition not found");
  }
}

export async function assertCandidateInOrganization(
  candidateId: number,
  organizationId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ one: candidates.candidateId })
    .from(candidates)
    .where(
      and(
        eq(candidates.candidateId, candidateId),
        eq(candidates.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(404, "Candidate not found");
  }
}

export async function assertApplicationInOrganization(
  applicationId: number,
  organizationId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ one: applications.applicationId })
    .from(applications)
    .where(
      and(
        eq(applications.applicationId, applicationId),
        eq(applications.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(404, "Application not found");
  }
}
