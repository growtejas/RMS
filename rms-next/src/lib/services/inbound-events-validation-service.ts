import { z } from "zod";

import { HttpError } from "@/lib/http/http-error";

const unknownRecord = z.record(z.string(), z.unknown());

const publicApplyStoredPayload = z.object({
  job_slug: z.string().min(1),
  applicant: z.object({
    full_name: z.string().min(1).max(150),
    email: z.string().email(),
    phone: z.string().max(30).optional().nullable(),
    resume_url: z.string().url().optional().nullable(),
  }),
});

const partnerStoredPayload = z.object({}).passthrough();

const bulkStoredPayload = unknownRecord;

export function validateInboundPayloadBySource(params: {
  source: string;
  payload: unknown;
}): void {
  let result:
    | ReturnType<typeof publicApplyStoredPayload.safeParse>
    | ReturnType<typeof partnerStoredPayload.safeParse>
    | ReturnType<typeof bulkStoredPayload.safeParse>;

  switch (params.source) {
    case "public_apply":
      result = publicApplyStoredPayload.safeParse(params.payload);
      break;
    case "linkedin":
    case "naukri":
      result = partnerStoredPayload.safeParse(params.payload);
      break;
    case "bulk":
      result = bulkStoredPayload.safeParse(params.payload);
      break;
    default:
      throw new HttpError(422, `Unsupported inbound source '${params.source}'`);
  }

  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.join(".") || "(root)";
    const message = issue?.message || "Invalid payload";
    throw new HttpError(422, `Invalid payload for source '${params.source}': ${path} ${message}`);
  }
}
