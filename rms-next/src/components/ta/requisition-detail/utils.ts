import {
  normalizeStatus,
  type RequisitionItemStatus,
} from "@/types/workflow";

import type { ExperienceFitFlag, ExperienceFitTone } from "./types";
import { ITEM_MILESTONE_ORDER } from "./types";

export function getItemMilestoneIndex(status: string): number {
  const idx = ITEM_MILESTONE_ORDER.indexOf(status as RequisitionItemStatus);
  return idx >= 0 ? idx : 0;
}

export function resolveExperienceFitFlag(
  requiredYears: number | null,
  candidateYears: number | null | undefined,
): ExperienceFitFlag | null {
  if (
    requiredYears == null ||
    !Number.isFinite(requiredYears) ||
    requiredYears < 0 ||
    candidateYears == null ||
    !Number.isFinite(candidateYears)
  ) {
    return null;
  }
  const req = Number(requiredYears);
  const cand = Number(candidateYears);
  const diff = cand - req;
  const abs = Math.abs(diff);
  const tone: ExperienceFitTone = abs <= 1 ? "green" : abs <= 3 ? "blue" : "red";
  const reqLabel = req === 0 ? "Fresher" : `${req}y`;
  const label =
    abs <= 1
      ? `Fits qualification • ${cand.toFixed(1)}y (JD: ${reqLabel})`
      : diff > 0
        ? `${abs <= 3 ? "Moderately" : "Too"} overqualified • ${cand.toFixed(1)}y (JD: ${reqLabel})`
        : `${abs <= 3 ? "Moderately" : "Too"} underqualified • ${cand.toFixed(1)}y (JD: ${reqLabel})`;
  return { tone, label, candidateYears: cand, requiredYears: req };
}

export function extractRequiredYearsFromText(
  text: string | null | undefined,
): number | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const m = normalized.match(
    /(\d{1,2})(?:\s*(?:\+|to|-)\s*(\d{1,2}))?\s*(?:years?|yrs?)/i,
  );
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : null;
  if (!Number.isFinite(a)) return null;
  if (b != null && Number.isFinite(b)) {
    return Math.round((a + b) / 2);
  }
  return a;
}

export function parseReqId(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function formatRelativeTime(dateValue?: string | null): string {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return "—";
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function parseSecondarySkills(requirements?: string): string[] {
  if (!requirements) return [];
  const match = requirements.match(/Secondary Skills:\s*([^|]+)/i);
  const matched = match?.[1];
  if (!matched) return [];
  return matched
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

export function parsePrimarySkill(requirements?: string): string | null {
  if (!requirements) return null;
  const match = requirements.match(/Primary Skill:\s*([^|]+)/i);
  return match?.[1]?.trim() ?? null;
}

export function formatItemBudget(
  amount: number | null | undefined,
  currency: string = "INR",
): string {
  if (amount == null || amount === 0) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function getOverallStatusClass(status: string): string {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case "Draft":
    case "Pending_Budget":
    case "Pending_HR":
      return "ticket-status open";
    case "Active":
      return "ticket-status in-progress";
    case "Fulfilled":
      return "ticket-status fulfilled";
    case "Rejected":
    case "Cancelled":
      return "ticket-status closed";
    default:
      return "ticket-status";
  }
}
