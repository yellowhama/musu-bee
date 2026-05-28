/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin tracing root to this app to avoid lockfile-based root inference drift.
  outputFileTracingRoot: process.cwd(),
  // Only use App Router, suppress Pages Router error page generation
  typescript: { ignoreBuildErrors: false },
  // `npm run lint -- --quiet` remains the lint gate. Avoid duplicating the
  // noisy warning-only ESLint pass inside `next build`.
  eslint: { ignoreDuringBuilds: true },
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
