import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * `distDir` must follow the **Next CLI phase**, not `process.env.NODE_ENV`.
 * If `.env.local` sets `NODE_ENV=production`, `next dev` still runs the dev server
 * but a NODE_ENV-based `distDir` would point at `.next` while dev compiles into
 * `.next-dev`, causing every `/_next/static/*` request to 404.
 */
/** @type {import('next').NextConfig | import('next').NextConfigFunction} */
export default (phase) => {
  const isNextDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    /**
     * Permanent fix for intermittent dev 500s like:
     * - GET /_next/static/* 500
     * - Cannot find module './NNNN.js' from .next/server/webpack-runtime.js
     *
     * Root cause: switching between `next build` and `next dev` can leave `.next`
     * in an inconsistent/corrupted state (especially with filesystem caching).
     *
     * Solution: keep dev output isolated from prod build output.
     */
    // Dev server only: `.next-dev` | `next build` / `next start`: `.next`
    distDir: isNextDev ? ".next-dev" : ".next",
    // Native/CommonJS parsers must not be bundled for API routes / server actions.
    serverExternalPackages: ["pdf-parse", "word-extractor"],
    // Reduces duplicate network calls in development caused by React 18 StrictMode
    // intentionally double-invoking effects. Production behavior is unaffected.
    reactStrictMode: false,
    /**
     * Persistent webpack filesystem cache under `.next/cache/webpack` can corrupt
     * (missing `./NNN.js` chunks, PackFileCacheStrategy restore errors). Memory
     * cache in dev avoids that; production `next build` is unchanged.
     */
    webpack: (config, { dev }) => {
      if (dev) {
        config.cache = { type: "memory" };
      }
      return config;
    },
  };
};
