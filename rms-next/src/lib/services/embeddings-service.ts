import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { candidateEmbeddings, requisitionItemEmbeddings } from "@/lib/db/schema";

const EMBEDDING_PROVIDER = "local-hash";
const EMBEDDING_MODEL = "hash-v1";
const DEFAULT_EMBEDDING_DIM = 256;

function resolveEmbeddingDimension(): number {
  const raw = process.env.EMBEDDING_VECTOR_DIM?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_EMBEDDING_DIM;
  }
  return Math.max(64, Math.min(2048, Math.floor(parsed)));
}

const EMBEDDING_DIM = resolveEmbeddingDimension();

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function sourceHash(input: string): string {
  return createHash("sha256").update(normalizeText(input)).digest("hex");
}

function tokenToVectorIndex(token: string, dim: number): { idx: number; sign: number } {
  const digest = createHash("sha256").update(token).digest();
  const idx = ((digest[0] << 8) | digest[1]) % dim;
  const sign = digest[2] % 2 === 0 ? 1 : -1;
  return { idx, sign };
}

function l2Normalize(vector: number[]): number[] {
  const mag = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
  if (mag <= 1e-8) {
    return vector;
  }
  return vector.map((n) => Number((n / mag).toFixed(8)));
}

function computeEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const normalized = normalizeText(text);
  const tokens = normalized.match(/[a-z0-9+#.]{2,}/g) ?? [];
  const vector = new Array<number>(dim).fill(0);
  if (!tokens.length) {
    return vector;
  }

  for (const token of tokens) {
    const { idx, sign } = tokenToVectorIndex(token, dim);
    vector[idx] += sign;
  }
  return l2Normalize(vector);
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const nums = value
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  return nums.length ? nums : null;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  if (leftNorm <= 1e-8 || rightNorm <= 1e-8) {
    return 0;
  }
  return Math.max(0, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}

export async function ensureRequisitionItemEmbedding(params: {
  requisitionItemId: number;
  requisitionId: number;
  sourceText: string;
}): Promise<number[]> {
  const embedding = computeEmbedding(params.sourceText);
  const hash = sourceHash(params.sourceText);
  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(requisitionItemEmbeddings)
      .where(eq(requisitionItemEmbeddings.requisitionItemId, params.requisitionItemId))
      .limit(1);

    if (existing?.sourceHash === hash) {
      const existingEmbedding = asNumberArray(existing.embedding);
      if (existingEmbedding && existingEmbedding.length === existing.embeddingDim) {
        return existingEmbedding;
      }
    }

    const now = new Date();
    await db
      .insert(requisitionItemEmbeddings)
      .values({
        requisitionItemId: params.requisitionItemId,
        requisitionId: params.requisitionId,
        provider: EMBEDDING_PROVIDER,
        model: EMBEDDING_MODEL,
        embeddingDim: embedding.length,
        embedding,
        sourceText: params.sourceText,
        sourceHash: hash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: requisitionItemEmbeddings.requisitionItemId,
        set: {
          requisitionId: params.requisitionId,
          provider: EMBEDDING_PROVIDER,
          model: EMBEDDING_MODEL,
          embeddingDim: embedding.length,
          embedding,
          sourceText: params.sourceText,
          sourceHash: hash,
          updatedAt: now,
        },
      });
    return embedding;
  } catch {
    // If DB migrations aren't applied yet (tables missing), don't block ranking reads.
    return embedding;
  }
}

export async function ensureCandidateEmbedding(params: {
  candidateId: number;
  requisitionItemId: number;
  requisitionId: number;
  sourceText: string;
}): Promise<number[]> {
  const embedding = computeEmbedding(params.sourceText);
  const hash = sourceHash(params.sourceText);
  try {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(candidateEmbeddings)
      .where(eq(candidateEmbeddings.candidateId, params.candidateId))
      .limit(1);

    if (existing?.sourceHash === hash) {
      const existingEmbedding = asNumberArray(existing.embedding);
      if (existingEmbedding && existingEmbedding.length === existing.embeddingDim) {
        return existingEmbedding;
      }
    }

    const now = new Date();
    await db
      .insert(candidateEmbeddings)
      .values({
        candidateId: params.candidateId,
        requisitionItemId: params.requisitionItemId,
        requisitionId: params.requisitionId,
        provider: EMBEDDING_PROVIDER,
        model: EMBEDDING_MODEL,
        embeddingDim: embedding.length,
        embedding,
        sourceText: params.sourceText,
        sourceHash: hash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: candidateEmbeddings.candidateId,
        set: {
          requisitionItemId: params.requisitionItemId,
          requisitionId: params.requisitionId,
          provider: EMBEDDING_PROVIDER,
          model: EMBEDDING_MODEL,
          embeddingDim: embedding.length,
          embedding,
          sourceText: params.sourceText,
          sourceHash: hash,
          updatedAt: now,
        },
      });
    return embedding;
  } catch {
    // If DB migrations aren't applied yet (tables missing), don't block candidate creation.
    return embedding;
  }
}
