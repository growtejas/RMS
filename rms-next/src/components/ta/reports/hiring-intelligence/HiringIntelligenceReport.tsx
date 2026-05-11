"use client";

import Link from "next/link";

import { HiringIntelligenceContent } from "@/components/analytics/HiringIntelligenceContent";
import { Button } from "@/components/ui/Button";

export default function HiringIntelligenceReport() {
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Export
        </Button>
        <Link href="/ta/reports">
          <Button variant="secondary">Back To Reports</Button>
        </Link>
      </div>
      <HiringIntelligenceContent
        scope={{ kind: "organization" }}
        title="Hiring Intelligence"
        subtitle="Enterprise hiring analytics across candidate and interview lifecycles."
      />
    </div>
  );
}
