import { z } from "zod";

/** Update JSON `applications.offer_meta` (null clears the column). */
export const applicationOfferMetaPatchBody = z.object({
  offer_meta: z.record(z.string(), z.unknown()).nullable(),
});
