import type { AppDb } from "@/lib/workflow/workflow-db";

export function asAppDb(tx: unknown): AppDb {
  return tx as AppDb;
}
