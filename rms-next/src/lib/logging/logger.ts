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

export function logError(
  message: string,
  err: unknown,
  fields?: Record<string, unknown>,
) {
  const e = err instanceof Error ? err : null;
  log("error", message, {
    ...fields,
    err_name: e?.name,
    err_message: e?.message,
    // Keep stack out of prod logs unless explicitly enabled (avoid accidental secrets).
    ...(isProd()
      ? {}
      : {
          err_stack: e?.stack,
        }),
  });
}

