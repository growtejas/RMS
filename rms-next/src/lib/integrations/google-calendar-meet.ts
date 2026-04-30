import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema";

type StoredGoogleToken = {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
};

type OrgTokenStore = {
  org?: StoredGoogleToken;
  users?: Record<string, StoredGoogleToken | undefined>;
};

type ResolvedToken = {
  source: "user" | "org";
  token: StoredGoogleToken;
  store: OrgTokenStore;
};

export type GenerateMeetLinkInput = {
  userId: number;
  organizationId: string;
  scheduledAtIso: string;
  endTimeIso: string;
  timezone: string;
  title: string;
  description?: string;
};

export type GenerateMeetLinkResult = {
  meetLink: string;
  eventId: string | null;
  tokenSource: "user" | "org";
};

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function isEnabled() {
  return process.env.GOOGLE_CALENDAR_SYNC_ENABLED === "true";
}

function hasCalendarScope(scope: string | undefined): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).includes(CALENDAR_SCOPE);
}

export function hasCalendarEventsScope(scope: string | undefined): boolean {
  return hasCalendarScope(scope);
}

function toStore(v: unknown): OrgTokenStore {
  if (!v || typeof v !== "object") {
    return {};
  }
  return v as OrgTokenStore;
}

async function loadOrgTokenStore(organizationId: string): Promise<OrgTokenStore> {
  const db = getDb();
  const [row] = await db
    .select({ googleOauthTokens: organizations.googleOauthTokens })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return toStore(row?.googleOauthTokens);
}

async function saveOrgTokenStore(
  organizationId: string,
  store: OrgTokenStore,
): Promise<void> {
  const db = getDb();
  await db
    .update(organizations)
    .set({ googleOauthTokens: store })
    .where(eq(organizations.id, organizationId));
}

export async function persistGoogleUserToken(params: {
  organizationId: string;
  userId: number;
  token: StoredGoogleToken;
}) {
  const db = getDb();
  const member = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, params.organizationId),
        eq(organizationMembers.userId, params.userId),
      ),
    )
    .limit(1);
  if (member.length === 0) return;

  const store = await loadOrgTokenStore(params.organizationId);
  const users = { ...(store.users ?? {}) };
  users[String(params.userId)] = params.token;
  await saveOrgTokenStore(params.organizationId, { ...store, users });
}

async function refreshToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client is not configured");
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => "");
    throw new Error(`Google token refresh failed (${tokenRes.status}): ${txt}`.slice(0, 700));
  }
  return (await tokenRes.json()) as GoogleTokenResponse;
}

async function resolveToken(params: {
  userId: number;
  organizationId: string;
}): Promise<ResolvedToken> {
  const store = await loadOrgTokenStore(params.organizationId);
  const userToken = store.users?.[String(params.userId)];
  if (userToken?.access_token) {
    return { source: "user", token: userToken, store };
  }
  if (store.org?.access_token) {
    return { source: "org", token: store.org, store };
  }
  throw new Error("Google token missing: connect Google account first");
}

async function ensureFreshAccessToken(params: {
  organizationId: string;
  userId: number;
  resolved: ResolvedToken;
}): Promise<{ accessToken: string; source: "user" | "org" }> {
  const { resolved } = params;
  const now = Date.now();
  const exp = resolved.token.expiry_date ?? 0;
  const tokenIsFresh = resolved.token.access_token && exp - now > 45_000;
  if (tokenIsFresh && hasCalendarScope(resolved.token.scope)) {
    return { accessToken: resolved.token.access_token, source: resolved.source };
  }
  if (!resolved.token.refresh_token) {
    if (resolved.token.access_token && hasCalendarScope(resolved.token.scope)) {
      return { accessToken: resolved.token.access_token, source: resolved.source };
    }
    throw new Error("Google token lacks calendar scope; reconnect with calendar.events scope");
  }
  const fresh = await refreshToken(resolved.token.refresh_token);
  const updated: StoredGoogleToken = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token || resolved.token.refresh_token,
    scope: fresh.scope || resolved.token.scope,
    token_type: fresh.token_type || resolved.token.token_type,
    expiry_date:
      Date.now() + Math.max(0, (fresh.expires_in ?? 3600) - 30) * 1000,
  };
  const store = resolved.store;
  if (resolved.source === "user") {
    const users = { ...(store.users ?? {}) };
    users[String(params.userId)] = updated;
    await saveOrgTokenStore(params.organizationId, { ...store, users });
  } else {
    await saveOrgTokenStore(params.organizationId, { ...store, org: updated });
  }
  if (!hasCalendarScope(updated.scope)) {
    throw new Error("Google token lacks calendar scope; reconnect with calendar.events scope");
  }
  return { accessToken: updated.access_token, source: resolved.source };
}

export async function generateGoogleMeetLink(
  input: GenerateMeetLinkInput,
): Promise<GenerateMeetLinkResult> {
  if (!isEnabled()) {
    throw new Error("Google Calendar integration is disabled");
  }
  const resolved = await resolveToken({
    userId: input.userId,
    organizationId: input.organizationId,
  });
  const { accessToken, source } = await ensureFreshAccessToken({
    organizationId: input.organizationId,
    userId: input.userId,
    resolved,
  });
  const requestId = `rms-${crypto.randomUUID()}`;
  const body = {
    summary: input.title,
    description: input.description ?? "",
    start: { dateTime: input.scheduledAtIso, timeZone: input.timezone },
    end: { dateTime: input.endTimeIso, timeZone: input.timezone },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google Calendar event create failed (${res.status}): ${txt}`.slice(0, 900));
  }
  const json = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
  };
  const meetLink = pickGoogleMeetLink(json);
  if (!meetLink) {
    throw new Error("Google Calendar event created but Meet link missing");
  }
  return {
    meetLink,
    eventId: json.id ?? null,
    tokenSource: source,
  };
}

export function pickGoogleMeetLink(json: {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
}): string {
  return (
    json.hangoutLink ||
    json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
    ""
  );
}

