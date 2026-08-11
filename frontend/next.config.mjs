/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Proxy /api/* to the backend so the browser always talks to the SAME origin
  // as the app. This makes tunnels (ngrok/Cloudflare) and reverse proxies work
  // with no CORS and no mixed-content issues — the browser never calls the
  // backend directly. Target is baked at build time from API_PROXY_TARGET.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
    ];
  },
};

export default nextConfig;
