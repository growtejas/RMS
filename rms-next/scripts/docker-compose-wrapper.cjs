#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");

const userArgs = process.argv.slice(2);
const composeFile = "ops/observability/docker-compose.yml";

function run(cmd, args) {
  return spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
  });
}

function hasDockerComposePlugin() {
  const probe = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore",
    shell: false,
  });
  return probe.status === 0;
}

function hasDockerComposeBinary() {
  const probe = spawnSync("docker-compose", ["--version"], {
    stdio: "ignore",
    shell: false,
  });
  return probe.status === 0;
}

let result;
if (hasDockerComposePlugin()) {
  result = run("docker", ["compose", "-f", composeFile, ...userArgs]);
} else if (hasDockerComposeBinary()) {
  result = run("docker-compose", ["-f", composeFile, ...userArgs]);
} else {
  console.error(
    "Docker Compose is not installed. Install either:\n" +
      "  - docker compose plugin (recommended), or\n" +
      "  - docker-compose standalone binary.\n",
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
