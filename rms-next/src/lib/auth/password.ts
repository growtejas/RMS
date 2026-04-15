import { pbkdf2Sync, timingSafeEqual } from "crypto";

import bcrypt from "bcryptjs";

/**
 * Passlib `ab64`: standard base64 with `+` replaced by `.`, no `=` padding.
 * See passlib.utils.binary.ab64_decode.
 */
function passlibAb64Decode(s: string): Buffer {
  const b64 = s.replace(/\./g, "+");
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLen);
  return Buffer.from(padded, "base64");
}

function verifyPbkdf2Sha256Passlib(plain: string, stored: string): boolean {
  const m = /^\$pbkdf2-sha256\$(\d+)\$([^$]+)\$([^$]+)$/.exec(stored);
  if (!m) {
    return false;
  }
  const rounds = Number.parseInt(m[1], 10);
  if (!Number.isFinite(rounds) || rounds < 1) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = passlibAb64Decode(m[2]);
    expected = passlibAb64Decode(m[3]);
  } catch {
    return false;
  }
  if (expected.length === 0) {
    return false;
  }
  const derived = pbkdf2Sync(plain, salt, rounds, expected.length, "sha256");
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}

/** New hashes (bcrypt); verified by `verifyPassword` and FastAPI passlib `bcrypt` scheme. */
export function hashPassword(plainPassword: string): string {
  return bcrypt.hashSync(plainPassword, 10);
}

/**
 * Match `backend/utils/security.py` CryptContext: pbkdf2_sha256 + bcrypt.
 */
export function verifyPassword(plainPassword: string, hashedPassword: string): boolean {
  if (!hashedPassword) {
    return false;
  }
  if (
    hashedPassword.startsWith("$2a$") ||
    hashedPassword.startsWith("$2b$") ||
    hashedPassword.startsWith("$2y$")
  ) {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  }
  if (hashedPassword.startsWith("$pbkdf2-sha256$")) {
    return verifyPbkdf2Sha256Passlib(plainPassword, hashedPassword);
  }
  return false;
}
