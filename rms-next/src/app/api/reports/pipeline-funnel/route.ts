import { parseReportFilters } from "@/lib/reports/filters";
import { getPipelineFunnelReport } from "@/lib/services/reports-service";

import { withReportHandler } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withReportHandler(
    req,
    async ({ user, url }) => {
      const filters = parseReportFilters(url);
      const stage = url.searchParams.get("stage") ?? url.searchParams.get("stageKey");
      return getPipelineFunnelReport(user.organizationId, filters, stage);
    },
    { routeName: "reports/pipeline-funnel" },
  );
}
