import { normalizeRoleList } from "@/lib/auth/normalize-roles";
import { verifyPassword } from "@/lib/auth/password";
import { createAccessToken, createRefreshToken } from "@/lib/auth/jwt";
import {
  findUserById,
  findUserByUsername,
  listRoleNamesForUser,
  touchUserLastLogin,
} from "@/lib/repositories/auth-user";

/** Same shape as FastAPI `TokenResponse` / `schemas.auth`. */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user_id: number;
  username: string;
  roles: string[];
}

export type AuthError = { status: number; detail: string };

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<{ ok: true; body: TokenResponse } | { ok: false; error: AuthError }> {
  const user = await findUserByUsername(username);
  if (!user) {
    return {
      ok: false,
      error: { status: 401, detail: "Incorrect username or password" },
    };
  }
  if (user.isActive === false) {
    return {
      ok: false,
      error: { status: 403, detail: "User account is inactive" },
    };
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return {
      ok: false,
      error: { status: 401, detail: "Incorrect username or password" },
    };
  }

  const rawRoles = await listRoleNamesForUser(user.userId);
  const roleList = normalizeRoleList(rawRoles);

  const access_token = await createAccessToken({
    sub: String(user.userId),
    username: user.username,
    roles: roleList,
  });
  const refresh_token = await createRefreshToken({
    sub: String(user.userId),
    username: user.username,
    roles: roleList,
  });

  await touchUserLastLogin(user.userId);

  return {
    ok: true,
    body: {
      access_token,
      refresh_token,
      token_type: "bearer",
      user_id: user.userId,
      username: user.username,
      roles: roleList,
    },
  };
}

export async function refreshForUserId(
  userId: number,
): Promise<{ ok: true; body: TokenResponse } | { ok: false; error: AuthError }> {
  const user = await findUserById(userId);
  if (!user) {
    return {
      ok: false,
      error: { status: 401, detail: "User not found" },
    };
  }
  if (user.isActive === false) {
    return {
      ok: false,
      error: { status: 403, detail: "User account is inactive" },
    };
  }

  const rawRoles = await listRoleNamesForUser(user.userId);
  const roleList = normalizeRoleList(rawRoles);

  const access_token = await createAccessToken({
    sub: String(user.userId),
    username: user.username,
    roles: roleList,
  });
  const refresh_token = await createRefreshToken({
    sub: String(user.userId),
    username: user.username,
    roles: roleList,
  });

  return {
    ok: true,
    body: {
      access_token,
      refresh_token,
      token_type: "bearer",
      user_id: user.userId,
      username: user.username,
      roles: roleList,
    },
  };
}
