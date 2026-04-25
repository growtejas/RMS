"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Noto_Sans } from "next/font/google";
import { useRouter } from "next/navigation";
import { Briefcase, Shield } from "lucide-react";

import { useAuth } from "@/contexts/useAuth";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

function readFromQuery(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("from");
}

function GoogleMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${notoSans.className} fixed inset-0 z-0 h-[100dvh] w-full overflow-y-auto overflow-x-hidden overscroll-none bg-black lg:overflow-hidden`}
    >
      {children}
    </div>
  );
}

function LoginHero() {
  return (
    <aside
      className="relative z-0 flex min-h-[100dvh] w-full flex-col justify-between bg-black px-5 py-8 text-neutral-50 sm:px-8 sm:py-10 lg:h-full lg:min-h-[100dvh] lg:px-10 lg:py-12 xl:px-14"
      aria-label="RBM product intro"
    >
      <div className="relative flex flex-col gap-7 sm:gap-9 lg:gap-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-lg shadow-red-600/35 sm:h-12 sm:w-12">
            <Briefcase className="h-6 w-6" strokeWidth={2.2} aria-hidden />
          </div>
          <div className="flex flex-col gap-0.5">
            <strong className="text-lg font-bold tracking-tight text-white sm:text-xl">
              RBM
            </strong>
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/50 sm:text-[0.7rem]">
              Resource fulfillment
            </span>
          </div>
        </div>

        <div>
          <h1 className="m-0 max-w-xl text-2xl font-bold leading-tight tracking-tight text-neutral-100 sm:text-3xl lg:text-[clamp(1.75rem,2.5vw+1rem,2.35rem)]">
            Your workforce journey,
            <span className="mt-1 block text-red-400">simplified.</span>
          </h1>
        </div>

        <p className="m-0 max-w-xl text-sm leading-relaxed text-white/55 sm:text-[0.95rem] sm:leading-relaxed">
          Recruit, track requisitions, and collaborate on hiring in one place, the way your team
          already works.
        </p>
      </div>

      <div className="relative mt-auto flex w-full flex-wrap items-center justify-start gap-x-6 gap-y-3 pb-2 text-xs text-white/45 sm:text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
          Secure &amp; private
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
            aria-hidden
          />
          Encrypted in transit
        </span>
      </div>
    </aside>
  );
}

function DividerOr() {
  return (
    <div
      className="my-4 flex select-none items-center gap-2.5 text-xs font-medium text-slate-400 sm:my-5 sm:text-sm"
      aria-hidden
    >
      <span className="h-px flex-1 bg-slate-200" />
      <span>or</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function LoginFormPanel({
  isLoading,
  error,
  username,
  setUsername,
  password,
  setPassword,
  onPasswordSubmit,
  onGoogle,
}: {
  isLoading: boolean;
  error: string;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  onPasswordSubmit: (e: React.FormEvent) => void;
  onGoogle: () => void;
}) {
  const fieldClass =
    "w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white focus:ring-2 focus:ring-neutral-900/10 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:py-0";

  return (
    <div
      className="relative z-10 flex w-full flex-col items-center justify-center overflow-x-hidden bg-white px-5 py-10 sm:px-8 sm:py-12 lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 lg:overflow-y-auto lg:px-12 lg:py-14 xl:px-16 lg:rounded-bl-[clamp(2.25rem,8vw,4.5rem)] lg:rounded-tl-[clamp(2.25rem,8vw,4.5rem)] rounded-t-[1.75rem] border-t border-neutral-200 sm:rounded-t-[2rem] lg:rounded-t-none lg:border-t-0"
    >
      <div className="relative w-full max-w-md">
        <div className="mb-1 flex flex-col items-center">
          <Image
            src="/rbm-logo.svg"
            alt=""
            width={100}
            height={30}
            priority
            className="h-6 w-auto max-w-[100px] object-contain sm:h-7"
          />
        </div>

        <h2 className="mb-1.5 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.6rem]">
          Welcome back
        </h2>
        <p className="mb-6 text-center text-sm leading-relaxed text-slate-500 sm:mb-7 sm:text-[0.95rem]">
          Sign in with your Google work account or username and password to access RMS.
        </p>

        {error ? (
          <div
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-left text-sm text-red-900 sm:mb-5"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onGoogle}
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:shadow disabled:cursor-not-allowed disabled:opacity-60 sm:h-[50px] sm:text-[0.95rem]"
        >
          <GoogleMark />
          <span>Continue with Google</span>
        </button>

        <DividerOr />

        <form onSubmit={onPasswordSubmit} className="flex flex-col gap-3.5 sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-username"
              className="text-xs font-medium text-neutral-600 sm:text-[0.8rem]"
            >
              Username
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              disabled={isLoading}
              autoComplete="username"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-password"
              className="text-xs font-medium text-neutral-600 sm:text-[0.8rem]"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isLoading}
              autoComplete="current-password"
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-b from-neutral-800 to-black text-sm font-semibold text-white shadow-md transition hover:-translate-y-px hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 sm:h-12"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mx-auto mt-6 max-w-[20rem] text-center text-[0.7rem] leading-relaxed text-slate-400 sm:mt-7 sm:text-xs">
          This portal is for authorized RBM staff. Need access? Use Google (@rbmsoft.com), then
          complete an access request, or contact your admin.
        </p>
      </div>
    </div>
  );
}

/** Inactive and/or unassigned — stay out of the main app; onboarding lives on `/access-request`. */
function needsAccessRequestOnboarding(u: {
  is_active?: boolean;
  roles: string[];
}): boolean {
  if (u.is_active === false) return true;
  return u.roles.length === 0;
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [forceShowForm, setForceShowForm] = useState(false);
  const { login, isAuthenticated, user, isHydrating } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => setForceShowForm(true), 12_000);
    return () => window.clearTimeout(id);
  }, []);

  const isOwner = user?.roles?.some((r) => r === "owner");
  const isAdmin = user?.roles?.some((r) => r === "admin" || r === "owner");
  const isHr = user?.roles?.some((r) => r === "hr");
  const isTa = user?.roles?.some((r) => r === "ta");
  const isManager = user?.roles?.some((r) => r === "manager");

  useEffect(() => {
    if (isHydrating || !isAuthenticated || !user) {
      return;
    }
    if (needsAccessRequestOnboarding(user)) {
      router.replace("/access-request");
      return;
    }
    const target = isOwner
      ? "/owner"
      : isAdmin
        ? "/admin"
        : isHr
          ? "/hr"
          : isTa
            ? "/ta"
            : isManager
              ? "/manager"
              : "/dashboard";
    router.replace(target);
  }, [
    isAdmin,
    isAuthenticated,
    isHr,
    isHydrating,
    isManager,
    isOwner,
    isTa,
    router,
    user,
  ]);

  const handleGoogleLogin = () => {
    const from = readFromQuery();
    const next = from && from !== "/login" ? decodeURIComponent(from) : "/";
    const url = `/api/integrations/google/oauth/start?next=${encodeURIComponent(next)}`;
    window.location.assign(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const loggedInUser = await login(username, password);
      const from = readFromQuery();
      const defaultRedirect = needsAccessRequestOnboarding(loggedInUser)
        ? "/access-request"
        : loggedInUser.roles.some(
            (r) => r === "admin" || r === "owner",
          )
          ? "/admin"
          : loggedInUser.roles.some((r) => r === "hr")
            ? "/hr"
            : loggedInUser.roles.some((r) => r === "ta")
              ? "/ta"
              : loggedInUser.roles.some((r) => r === "manager")
                ? "/manager"
                : "/dashboard";
      const target =
        from && from !== "/login" ? decodeURIComponent(from) : defaultRedirect;
      router.replace(target);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Invalid credentials. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isHydrating && isAuthenticated && !forceShowForm) {
    return (
      <LoginShell>
        <div className="relative min-h-[100dvh] w-full">
          <div className="lg:pr-[50vw]">
            <LoginHero />
          </div>
          <div className="relative z-10 flex w-full flex-col items-center justify-center overflow-x-hidden bg-white px-5 py-12 rounded-t-[1.75rem] border-t border-neutral-200 sm:rounded-t-[2rem] lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 lg:overflow-y-auto lg:px-12 lg:py-14 xl:px-16 lg:rounded-bl-[clamp(2.25rem,8vw,4.5rem)] lg:rounded-tl-[clamp(2.25rem,8vw,4.5rem)] lg:rounded-t-none lg:border-t-0">
            <div className="w-full max-w-md text-center">
              <h2 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">
                Restoring session
              </h2>
              <p className="m-0 text-sm text-slate-500">Please wait…</p>
            </div>
          </div>
        </div>
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <div className="relative min-h-[100dvh] w-full">
        <div className="lg:pr-[50vw]">
          <LoginHero />
        </div>
        <LoginFormPanel
          isLoading={isLoading}
          error={error}
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
          onPasswordSubmit={handleSubmit}
          onGoogle={handleGoogleLogin}
        />
      </div>
    </LoginShell>
  );
}
