import { getDb } from "@/lib/db";
import { resumeParseArtifacts } from "@/lib/db/schema";
import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";

export async function insertResumeParseArtifact(params: {
  inboundEventId: number;
  artifact: ParsedResumeArtifact;
}): Promise<void> {
  const db = getDb();
  await db.insert(resumeParseArtifacts).values({
    inboundEventId: params.inboundEventId,
    parserProvider: params.artifact.parserProvider,
    parserVersion: params.artifact.parserVersion,
    status: params.artifact.status,
    sourceResumeRef: params.artifact.sourceResumeRef,
    rawText: params.artifact.rawText,
    parsedData: params.artifact.parsedData,
    errorMessage: params.artifact.errorMessage,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
