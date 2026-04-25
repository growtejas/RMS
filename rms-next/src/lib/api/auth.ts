import { apiClient } from "./client";

export interface RefreshTokenResponse {
  token_type: string;
  user_id: number;
  username: string;
  roles: string[];
  csrf_token?: string;
}

export async function refreshAccessToken(): Promise<RefreshTokenResponse> {
  const { data } = await apiClient.post<RefreshTokenResponse>(
    "/auth/refresh",
    undefined,
    { timeout: 15_000 },
  );
  return data;
}

export interface MeResponse {
  user_id: number;
  username: string;
  roles: string[];
}

export type SessionResponse =
  | { authenticated: false }
  | (MeResponse & {
      authenticated: true;
      organization_id: string;
      is_active: boolean;
    });

export async function fetchSession(): Promise<SessionResponse> {
  const { data } = await apiClient.get<SessionResponse>("/auth/session", {
    timeout: 15_000,
  });
  return data;
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>("/auth/me", { timeout: 15_000 });
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout", undefined, { timeout: 15_000 });
}
