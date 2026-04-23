/** @type {import('next').NextConfig} */
const nextConfig = {
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
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
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

export default nextConfig;
