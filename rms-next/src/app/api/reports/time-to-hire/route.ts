import { parseReportFilters } from "@/lib/reports/filters";
import { getTimeToHireReport } from "@/lib/services/reports-service";

import { withReportHandler } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withReportHandler(
    req,
    async ({ user, url }) => {
      const filters = parseReportFilters(url);
      return getTimeToHireReport(user.organizationId, filters);
    },
    { routeName: "reports/time-to-hire" },
  );
}
