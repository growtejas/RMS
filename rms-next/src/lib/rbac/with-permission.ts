/**
 * RBAC guard for API routes. Wire to Auth.js session + DB roles when migrating off FastAPI.
 *
 * Usage (future):
 *   const user = await requireSession();
 *   await assertPermission(user, "candidates:view", { scope: "global" });
 */

export type PermissionScope = "global" | "job" | "department";

export interface PermissionContext {
  scope?: PermissionScope;
  jobId?: number;
  departmentId?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Placeholder session until Auth.js v5 is configured. */
export interface SessionUser {
  userId: number;
  organizationId?: number | null;
  roles: string[];
  permissions?: Record<string, boolean> | string[];
}

/**
 * Replace with Auth.js `auth()` / `getServerSession` and your user loader.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  return null;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new HttpError("Unauthorized", 401);
  }
  return user;
}

/**
 * Stub: allow all when no auth is wired; tighten when permissions exist in DB/session.
 */
export async function assertPermission(
  user: SessionUser,
  permission: string,
  ctx?: PermissionContext,
): Promise<void> {
  void ctx;
  if (user.permissions && typeof user.permissions === "object") {
    const map = user.permissions as Record<string, boolean>;
    if (map[permission] === false) {
      throw new HttpError("Forbidden", 403);
    }
  }
}

export async function withPermission<T>(
  permission: string,
  ctx: PermissionContext | undefined,
  fn: (user: SessionUser) => Promise<T>,
): Promise<T> {
  const user = await requireSession();
  await assertPermission(user, permission, ctx);
  return fn(user);
}
