import type { NormalizedInboundCandidate, ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import * as candidatesRepo from "@/lib/repositories/candidates-repo";

const MIN_PHONE_DIGITS = 8;

export function digitsOnlyPhone(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const digits = input.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS ? digits : null;
}

export function normalizeComparableText(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const collapsed = input.trim().toLowerCase().replace(/\s+/g, " ");
  return collapsed ? collapsed : null;
}

export function resolveDedupePhoneDigits(
  normalized: NormalizedInboundCandidate,
  parsed: ParsedResumeArtifact,
): string | null {
  const fromApplicant = digitsOnlyPhone(normalized.phone);
  if (fromApplicant) {
    return fromApplicant;
  }
  const phones = parsed.parsedData.phones;
  if (!Array.isArray(phones)) {
    return null;
  }
  for (const p of phones) {
    if (typeof p !== "string") {
      continue;
    }
    const d = digitsOnlyPhone(p);
    if (d) {
      return d;
    }
  }
  return null;
}

export type SoftDedupeKind = "phone" | "name-company" | "name";

/**
 * Same requisition item, different email: phone digits match and/or normalized name (+ optional company).
 */
export async function collectSoftDedupeMatches(params: {
  requisitionItemId: number;
  normalized: NormalizedInboundCandidate;
  parsed: ParsedResumeArtifact;
  resolvedEmailLower: string | null;
  resolvedFullName: string;
}): Promise<{
  probableIds: number[];
  reasons: string[];
  strongestKind: SoftDedupeKind | null;
}> {
  const reasons: string[] = [];
  const ids = new Set<number>();
  let strongestKind: SoftDedupeKind | null = null;

  const rank = (k: SoftDedupeKind) => {
    const order: SoftDedupeKind[] = ["name", "phone", "name-company"];
    if (!strongestKind || order.indexOf(k) > order.indexOf(strongestKind)) {
      strongestKind = k;
    }
  };

  const phoneDigits = resolveDedupePhoneDigits(params.normalized, params.parsed);
  if (phoneDigits) {
    const phoneHits = await candidatesRepo.selectCandidateIdsSameItemPhoneDigits({
      requisitionItemId: params.requisitionItemId,
      phoneDigits,
      excludeEmailLower: params.resolvedEmailLower,
    });
    for (const id of phoneHits) {
      ids.add(id);
    }
    if (phoneHits.length) {
      reasons.push(
        `Same job line and phone digits match another candidate (${phoneHits.join(", ")}) with a different email`,
      );
      rank("phone");
    }
  }

  const normName = normalizeComparableText(params.resolvedFullName);
  const normCompany =
    normalizeComparableText(params.normalized.currentCompany) ??
    normalizeComparableText(
      typeof params.parsed.parsedData.current_company === "string"
        ? params.parsed.parsedData.current_company
        : null,
    );

  if (normName) {
    if (normCompany) {
      const ncHits = await candidatesRepo.selectCandidateIdsSameItemNameAndCompany({
        requisitionItemId: params.requisitionItemId,
        normalizedFullNameKey: normName,
        normalizedCompanyKey: normCompany,
        excludeEmailLower: params.resolvedEmailLower,
      });
      for (const id of ncHits) {
        ids.add(id);
      }
      if (ncHits.length) {
        reasons.push(
          `Same job line, name, and current company match other candidate id(s): ${ncHits.join(", ")}`,
        );
        rank("name-company");
      }
    } else {
      const nHits = await candidatesRepo.selectCandidateIdsSameItemNameNoCompany({
        requisitionItemId: params.requisitionItemId,
        normalizedFullNameKey: normName,
        excludeEmailLower: params.resolvedEmailLower,
      });
      for (const id of nHits) {
        ids.add(id);
      }
      if (nHits.length) {
        reasons.push(
          `Same job line and name match other candidate id(s) with no stored company: ${nHits.join(", ")}`,
        );
        rank("name");
      }
    }
  }

  return { probableIds: Array.from(ids), reasons, strongestKind };
}
