export type LogLevel = "debug" | "info" | "warn" | "error";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function log(
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(fields ?? {}),
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  if (!isProd() && level === "debug") {
    // eslint-disable-next-line no-console
    console.debug(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

/** Walk `Error.cause` chain (Drizzle → driver → Postgres). */
export function unwrapErrorCauses(err: unknown, maxDepth: number): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  for (let d = 0; d < maxDepth && cur != null; d++) {
    if (seen.has(cur)) {
      break;
    }
    seen.add(cur);
    if (cur instanceof Error && cur.message) {
      messages.push(cur.message);
    }
    const next =
      cur instanceof Error && "cause" in cur
        ? (cur as Error & { cause?: unknown }).cause
        : undefined;
    cur = next;
  }
  return messages;
}

export function logError(
  message: string,
  err: unknown,
  fields?: Record<string, unknown>,
) {
  const e = err instanceof Error ? err : null;
  const chain = !isProd() ? unwrapErrorCauses(err, 8) : [];
  /** Drizzle often wraps Postgres; the driver puts the real PG text on `cause`. */
  const err_cause_chain = chain.length > 1 ? chain.slice(1) : undefined;
  log("error", message, {
    ...fields,
    err_name: e?.name,
    err_message: e?.message,
    ...(err_cause_chain != null && err_cause_chain.length > 0
      ? { err_cause_chain }
      : {}),
    // Keep stack out of prod logs unless explicitly enabled (avoid accidental secrets).
    ...(isProd()
      ? {}
      : {
          err_stack: e?.stack,
        }),
  });
}

