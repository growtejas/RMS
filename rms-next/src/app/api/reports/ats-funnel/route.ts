import { getAtsFunnelForOrganization } from "@/lib/services/ats-funnel-report-service";

import { withReportHandler } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withReportHandler(
    req,
    async ({ user }) => {
      const funnel = await getAtsFunnelForOrganization(user.organizationId);
      return { organization_id: user.organizationId, funnel };
    },
    { routeName: "reports/ats-funnel" },
  );
}
