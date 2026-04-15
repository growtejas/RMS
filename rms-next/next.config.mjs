/** @type {import('next').NextConfig} */
const nextConfig = {
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
