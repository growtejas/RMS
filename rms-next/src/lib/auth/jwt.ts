import { SignJWT, jwtVerify } from "jose";

function getSecretKey(): Uint8Array {
  const raw =
    process.env.JWT_SECRET_KEY?.trim() ||
    process.env.SECRET_KEY?.trim() ||
    "";
  if (!raw) {
    throw new Error("JWT_SECRET_KEY or SECRET_KEY must be set for auth routes");
  }
  return new TextEncoder().encode(raw);
}

function expireMinutes(): number {
  const m = Number.parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES ?? "60", 10);
  return Number.isFinite(m) && m > 0 ? m : 60;
}

function refreshExpireDays(): number {
  const d = Number.parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS ?? "14", 10);
  return Number.isFinite(d) && d > 0 ? d : 14;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  roles: string[];
  /** Tenant scope (organization UUID). */
  orgId: string;
}

export async function createAccessToken(payload: AccessTokenPayload): Promise<string> {
  const alg = process.env.JWT_ALGORITHM === "HS384" ? "HS384" : "HS256";
  const secret = getSecretKey();
  const minutes = expireMinutes();

  return new SignJWT({
    username: payload.username,
    roles: payload.roles,
    org_id: payload.orgId,
    typ: "access",
  })
    .setProtectedHeader({ alg })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${minutes}m`)
    .sign(secret);
}

export async function verifyAccessToken(token: string) {
  const alg = process.env.JWT_ALGORITHM === "HS384" ? "HS384" : "HS256";
  const secret = getSecretKey();
  const { payload } = await jwtVerify(token, secret, { algorithms: [alg] });
  if ((payload as { typ?: unknown }).typ !== "access") {
    throw new Error("Invalid token type");
  }
  return payload;
}

export async function createRefreshToken(payload: AccessTokenPayload): Promise<string> {
  const alg = process.env.JWT_ALGORITHM === "HS384" ? "HS384" : "HS256";
  const secret = getSecretKey();
  const days = refreshExpireDays();

  return new SignJWT({
    username: payload.username,
    roles: payload.roles,
    org_id: payload.orgId,
    typ: "refresh",
  })
    .setProtectedHeader({ alg })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret);
}

export async function verifyRefreshToken(token: string) {
  const alg = process.env.JWT_ALGORITHM === "HS384" ? "HS384" : "HS256";
  const secret = getSecretKey();
  const { payload } = await jwtVerify(token, secret, { algorithms: [alg] });
  if ((payload as { typ?: unknown }).typ !== "refresh") {
    throw new Error("Invalid token type");
  }
  return payload;
}
