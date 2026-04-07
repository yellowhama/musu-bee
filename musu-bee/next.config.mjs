/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use App Router, suppress Pages Router error page generation
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
