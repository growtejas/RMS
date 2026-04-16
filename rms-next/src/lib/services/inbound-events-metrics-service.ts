import { getInboundEventStatusCounts } from "@/lib/repositories/inbound-events-repo";

export async function getInboundEventMetrics() {
  const counts = await getInboundEventStatusCounts();
  const processedOrFailed = counts.processed + counts.failed;
  const successRatePct =
    processedOrFailed === 0
      ? 0
      : Number(((counts.processed / processedOrFailed) * 100).toFixed(2));

  return {
    queue: {
      name: "inbound-events",
      processing_pipeline: [
        "process-event",
        "normalize-data",
        "parse-resume",
        "deduplicate",
        "persist-candidate",
      ],
    },
    events: counts,
    rates: {
      success_rate_pct: successRatePct,
    },
    generated_at: new Date().toISOString(),
  };
}
