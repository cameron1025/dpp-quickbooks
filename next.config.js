/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Security Headers (Intuit requirement + OWASP best practices) ──
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://appcenter.intuit.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https://*.intuit.com https://*.supabase.co wss://*.supabase.co",
              "frame-src 'self' https://appcenter.intuit.com",
              "base-uri 'self'",
              "form-action 'self' https://appcenter.intuit.com",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // ── Redirects ──
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },

  // ── Image optimization ──
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.intuit.com",
      },
    ],
  },


  // ── Powered by header removed for security ──
  poweredByHeader: false,
};

module.exports = nextConfig;
