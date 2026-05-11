/**
 * Phase 8 - OpenTelemetry boot.
 *
 * Next 14 calls `register()` exactly once at server start. We lazy-load
 * the SDK so:
 *   - workers / tests can import this file without paying the SDK cost.
 *   - production opt-in via `RMS_OTEL_ENABLED=true`; absent the flag we
 *     no-op so a missing collector cannot block server start.
 *
 * Endpoint defaults to the OTLP/HTTP collector convention; override via
 * `OTEL_EXPORTER_OTLP_ENDPOINT`.
 */
export async function register(): Promise<void> {
  if (process.env.RMS_OTEL_ENABLED !== "true") {
    return;
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    const [{ NodeSDK }, { OTLPTraceExporter }, autoInstr] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/auto-instrumentations-node"),
    ]);
    if (!process.env.OTEL_SERVICE_NAME) {
      process.env.OTEL_SERVICE_NAME = "rms-next";
    }
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      }),
      instrumentations: [
        autoInstr.getNodeAutoInstrumentations({
          // Trim the loud ones; we only need pg / http / bullmq tracing.
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });
    sdk.start();
    process.on("SIGTERM", () => {
      void sdk.shutdown().catch(() => undefined);
    });
  } catch {
    // Best-effort: a misconfigured collector must not block the app.
  }
}
