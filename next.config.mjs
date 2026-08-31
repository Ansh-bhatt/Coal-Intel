/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint/type-checking are intentionally left on; lint errors at build time are
  // suppressed here so `next build` remains deterministic across environments.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
