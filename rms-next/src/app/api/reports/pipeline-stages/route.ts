import { getPipelineStageContext } from "@/lib/analytics/pipeline/stages-service";

import { withReportHandler } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the canonical, ordered set of pipeline stage definitions for
 * the requesting organization. Used by the report UI funnel renderer to
 * adapt automatically to custom/reordered/hidden stage configurations.
 */
export async function GET(req: Request) {
  return withReportHandler(
    req,
    async ({ user }) => {
      const context = await getPipelineStageContext(user.organizationId);
      return {
        stages: context.all.map((s) => ({
          key: s.key,
          label: s.label,
          sortOrder: s.sortOrder,
          isTerminal: s.isTerminal,
          isHidden: s.isHidden,
          stageType: s.stageType,
        })),
      };
    },
    { routeName: "reports/pipeline-stages" },
  );
}
