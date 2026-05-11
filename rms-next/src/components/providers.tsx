"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import { WebVitalsReporter } from "@/components/perf/WebVitalsReporter";

/**
 * Phase 3 - one QueryClient per browser tab, with conservative defaults.
 *
 * Per-domain `staleTime` / `gcTime` overrides live in the typed hooks under
 * `@/lib/query/hooks`; these defaults catch ad-hoc `useQuery` call sites
 * during the migration. `refetchOnWindowFocus` is kept off because the SSE
 * pipeline (Phase 4) carries the real-time updates.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: "always",
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebVitalsReporter />
        {children}
        <Toaster richColors closeButton position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
