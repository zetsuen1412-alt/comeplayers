import type { NextConfig } from "next";

function safeFrameOrigin(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

const empiresAlliesFrameOrigin = safeFrameOrigin(
  process.env.EMPIRES_ALLIES_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_EMPIRES_ALLIES_URL,
);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://*.paypal.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.paypal.com https://*.paypalobjects.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  `frame-src 'self' https://*.paypal.com${empiresAlliesFrameOrigin ? ` ${empiresAlliesFrameOrigin}` : ""}`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // Start in report-only mode so PayPal and Supabase traffic can be observed
    // in staging before this policy is enforced in production.
    key: "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicy,
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Cross-platform tests are checked separately with both workspaces installed.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.doku.com",
        port: "",
        pathname: "/doku-mcp-server/api/qr/generate",
      },
      {
        protocol: "https",
        hostname: "api-sandbox.doku.com",
        port: "",
        pathname: "/doku-mcp-server/api/qr/generate",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/messages",
        destination: "/chat",
        permanent: true,
      },
      {
        source: "/messages/:path*",
        destination: "/cpcommunity/:path*",
        permanent: true,
      },
      {
        source: "/comeplayers/:path*",
        destination: "/cpcommunity/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
