/**
 * Standard API envelope for Next.js route handlers (migration target for FastAPI).
 * All new `/app/api/**` routes should return this shape unless proxying legacy backend.
 */

export type ApiSuccess<T> = { success: true; data: T; error: null };
export type ApiFailure = { success: false; data: null; error: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data, error: null };
}

export function fail(message: string): ApiFailure {
  return { success: false, data: null, error: message };
}

export function jsonResponse<T>(
  result: ApiResponse<T>,
  status?: number,
): Response {
  const code =
    status ??
    (result.success ? 200 : result.error.toLowerCase().includes("unauthorized")
      ? 401
      : result.error.toLowerCase().includes("forbidden")
        ? 403
        : result.error.toLowerCase().includes("not found")
          ? 404
          : 400);
  return Response.json(result, { status: code });
}
