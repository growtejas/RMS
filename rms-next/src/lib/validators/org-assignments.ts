import { z } from "zod";

export const assignmentCreateBody = z.object({
  department_id: z.number().int(),
  manager_id: z.string().nullable().optional(),
  location_id: z.number().int().nullable().optional(),
  start_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
});

export const assignmentEndBody = z.object({
  end_date: z.string().min(1),
});
