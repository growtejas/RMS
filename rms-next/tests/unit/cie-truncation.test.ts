import assert from "node:assert/strict";
import test from "node:test";

import { runStrictResumeV2FromText } from "@/lib/services/resume-structure/strict-resume-v2-llm";

const validV2Json = JSON.stringify({
  schema: "strict_resume_v2",
  profile_type: "mid",
  profile_type_confidence: 0.8,
  warnings: [],
  core: {
    basicInfo: {
      name: { value: "X", prov: { source: "header", confidence: 0.9 } },
      email: { value: "x@y.z", prov: { source: "header", confidence: 0.9 } },
      phone: { value: null, prov: { source: "unknown", confidence: 0 } },
    },
    skills: [],
    experience: [],
    projects: [],
    education: [],
  },
});

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const ENV_KEYS_TO_RESTORE = [
  "RESUME_STRUCTURE_OPENAI_API_KEY",
  "RESUME_STRUCTURE_OPENAI_BASE_URL",
  "RESUME_STRUCTURE_OPENAI_MODEL",
  "RESUME_STRUCTURE_LLM_MAX_INPUT_CHARS",
  "RESUME_STRUCTURE_V2_ENABLED",
] as const;

function snapshotEnv() {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS_TO_RESTORE) snap[k] = process.env[k];
  return snap;
}
function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS_TO_RESTORE) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

test("runStrictResumeV2FromText: reports truncated=true when raw exceeds max chars", async (t) => {
  const envSnap = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.RESUME_STRUCTURE_OPENAI_API_KEY = "sk-test";
  process.env.RESUME_STRUCTURE_V2_ENABLED = "1";
  process.env.RESUME_STRUCTURE_LLM_MAX_INPUT_CHARS = "200";

  let captured: { url: string; body: string } | null = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured = { url, body: String(init?.body ?? "") };
    return makeOkResponse({
      choices: [{ message: { content: validV2Json } }],
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnap);
  });

  const longText = "abcdefghij ".repeat(100); // 1100 chars » 200 cap → truncated
  const result = await runStrictResumeV2FromText({ resumeText: longText });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.truncated, true);
  assert.equal(result.usedChars, 200);
  assert.equal(result.rawChars, longText.trim().length);
  assert.notEqual(captured, null);
});

test("runStrictResumeV2FromText: truncated=false when raw fits cap", async (t) => {
  const envSnap = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.RESUME_STRUCTURE_OPENAI_API_KEY = "sk-test";
  process.env.RESUME_STRUCTURE_V2_ENABLED = "1";
  process.env.RESUME_STRUCTURE_LLM_MAX_INPUT_CHARS = "5000";

  globalThis.fetch = (async () =>
    makeOkResponse({
      choices: [{ message: { content: validV2Json } }],
    })) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnap);
  });

  const shortText = "hello world";
  const result = await runStrictResumeV2FromText({ resumeText: shortText });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.truncated, false);
  assert.equal(result.rawChars, shortText.length);
  assert.equal(result.usedChars, shortText.length);
});
