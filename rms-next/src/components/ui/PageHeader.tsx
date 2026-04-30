"use client";

import React from "react";
import { typography } from "@/lib/ui/tokens";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className={typography.pageTitle}>{title}</h2>
        {subtitle ? <p className={`mt-1 ${typography.body}`}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
