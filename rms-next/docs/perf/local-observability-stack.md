# Local Observability Stack (OTEL + Prometheus + Grafana)

This adds a one-command local stack for Phase 8 observability.

## What it starts

- OpenTelemetry Collector: `http://127.0.0.1:4318` (OTLP HTTP ingest)
- Prometheus: [http://127.0.0.1:9090](http://127.0.0.1:9090)
- Grafana: [http://127.0.0.1:3001](http://127.0.0.1:3001) (`admin` / `admin`)

Compose file:

- `ops/observability/docker-compose.yml`

Provisioned dashboard:

- `RMS Queue Health (Local)` in folder `RMS`
- `RMS API Latency (Local Starter)`
- `RMS Pool Health (Local Starter)`
- `RMS React UX (Local Starter)`

## Prerequisites

- Docker + Docker Compose installed and running
- RMS app running locally on port `3002`
- `.env.local` contains:
  - `METRICS_BEARER_TOKEN=change-me-local-token` (or update Prometheus config)
  - `RMS_OTEL_ENABLED=true` (optional for trace testing)
  - `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/v1/traces`

You can bootstrap env keys with:

```bash
npm run setup:observability
```

## Run

From `rms-next/`:

```bash
npm run obs:up
```

Then open Grafana and Prometheus URLs above.

## Stop

```bash
npm run obs:down
```

## Logs

```bash
npm run obs:logs
```

## Notes

- Prometheus scrapes your host app at `host.docker.internal:3002/api/metrics`.
- The scrape uses bearer auth configured in `ops/observability/prometheus.yml`.
- If you change the token in `.env.local`, update `prometheus.yml` to match.
- Alert rules are loaded from `ops/observability/alerts.yml`.
