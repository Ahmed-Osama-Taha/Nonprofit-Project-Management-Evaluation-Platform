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
  // Security headers. The CSP is the primary XSS mitigation (the httpOnly auth
  // cookie already makes the session token unreadable to JS). 'unsafe-inline'
  // for script is a pragmatic allowance for Next's runtime; hardening to a
  // nonce-based policy is a follow-up.
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
