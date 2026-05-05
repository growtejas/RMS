import type { CandidateRow } from "@/lib/repositories/candidates-repo";
import type { NormalizedInboundCandidate, ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";
import {
  parsedArtifactToCacheRecord,
  resolveResumeRefForFilesystem,
  tryResumeParseCacheHit,
  tryStatLocalResumeFile,
  type ResumeParseCacheRecord,
} from "@/lib/services/resume-parse-cache";
import { parseResumeArtifact } from "@/lib/services/resume-parser-service";

/**
 * Returns a processed legacy-parser artifact for the candidate resume (cache hit or fresh parse).
 * Does not persist; caller updates `candidates.resume_parse_cache` when returning a freshly parsed row.
 */
export async function resolveLegacyResumeArtifactForCandidate(
  row: Pick<CandidateRow, "resumePath" | "resumeParseCache" | "fullName" | "email" | "phone">,
): Promise<{
  artifact: ParsedResumeArtifact;
  cacheRec: ResumeParseCacheRecord;
  resumePathTrim: string;
  resumeRef: string;
  fromCache: boolean;
} | null> {
  const resumePathTrim = row.resumePath?.trim() ?? "";
  if (!resumePathTrim) {
    return null;
  }
  const resumeRef = resolveResumeRefForFilesystem(resumePathTrim);
  if (!resumeRef) {
    return null;
  }

  const hit = await tryResumeParseCacheHit({
    candidateResumePath: resumePathTrim,
    resumeRef,
    dbCache: row.resumeParseCache,
  });
  if (hit?.status === "processed") {
    const stat = await tryStatLocalResumeFile(resumeRef);
    const cacheRec = parsedArtifactToCacheRecord(hit, stat, resumePathTrim);
    return {
      artifact: hit,
      cacheRec,
      resumePathTrim,
      resumeRef,
      fromCache: true,
    };
  }

  const normalized: NormalizedInboundCandidate = {
    fullName: row.fullName ?? null,
    email: row.email?.trim() || "unknown@local.invalid",
    phone: row.phone ?? null,
    currentCompany: null,
    resumeUrl: resumeRef,
    source: "cie_parsed_resume_api",
    externalId: `cie-${resumePathTrim}`,
    jobSlug: null,
  };
  const artifact = await parseResumeArtifact({ normalizedCandidate: normalized });
  const stat = await tryStatLocalResumeFile(resumeRef);
  const cacheRec = parsedArtifactToCacheRecord(artifact, stat, resumePathTrim);
  return {
    artifact,
    cacheRec,
    resumePathTrim,
    resumeRef,
    fromCache: false,
  };
}
