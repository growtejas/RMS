/**
 * Requisition-scoped analytics helpers.
 *
 * Anything specific to "report scoped to a requisition" lives here so the
 * requisition reports surface uses the same engine as org-level reports.
 */

import { loadApplicationAnalyticsBundle, type ApplicationAnalyticsBundle } from "@/lib/analytics/aggregations/load-application-bundle";
import { type AnalyticsScope, narrowFiltersByTarget } from "@/lib/analytics/utils/scope";

export interface RequisitionScopeBundle {
  bundle: ApplicationAnalyticsBundle;
}

export async function loadRequisitionScopeBundle(
  scope: AnalyticsScope,
): Promise<RequisitionScopeBundle> {
  const filters = narrowFiltersByTarget(scope);
  const bundle = await loadApplicationAnalyticsBundle(scope.organizationId, filters);
  return { bundle };
}
