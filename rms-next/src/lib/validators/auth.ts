import { z } from "zod";

export const loginBodySchema = z.object({
  username: z.string().min(1, "username required"),
  password: z.string().min(1, "password required"),
});
