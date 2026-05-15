"use client";

import Link from "next/link";

import { HiringIntelligenceContent } from "@/components/analytics/HiringIntelligenceContent";
import { Button } from "@/components/ui/Button";

export default function HrReportsPage() {
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Export
        </Button>
        <Link href="/hr">
          <Button variant="secondary">Back To Dashboard</Button>
        </Link>
      </div>
      <HiringIntelligenceContent
        scope={{ kind: "organization" }}
        title="Hiring Intelligence"
        subtitle="Read-only analytics including candidate funnel and lifecycle trends."
      />
    </div>
  );
}
