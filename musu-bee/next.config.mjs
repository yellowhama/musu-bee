/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin tracing root to this app to avoid lockfile-based root inference drift.
  outputFileTracingRoot: process.cwd(),
  // Only use App Router, suppress Pages Router error page generation
  typescript: { ignoreBuildErrors: false },
  // Next 16 removed the `next lint` command and dropped the `eslint` key from
  // next.config; `next build` no longer runs ESLint. The lint gate is now solely
  // `npm run lint` (eslint .). See https://nextjs.org/docs/messages/invalid-next-config
  // Build pinned to the webpack builder (`next build --webpack`) so the
  // production cache-disable below keeps working; Turbopack is default in 16.
  webpack: (config, { dev }) => {
    if (!dev) {
      config.cache = false;
    }
    return config;
  },
};

if (process.env.TAURI_ENV !== 'true') {
  nextConfig.headers = async function() {
    return [{
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'self' https://musu.pro https://*.musu.pro",
        },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-DNS-Prefetch-Control', value: 'on' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  };
}

export default nextConfig;
