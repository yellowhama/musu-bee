/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin tracing root to this app to avoid lockfile-based root inference drift.
  outputFileTracingRoot: process.cwd(),
  // Only use App Router, suppress Pages Router error page generation
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{
      source: '/:path*',
      headers: [{
        key: 'Content-Security-Policy',
        value: "frame-ancestors 'self' https://musu.pro https://*.musu.pro",
      }],
    }];
  },
};

export default nextConfig;
