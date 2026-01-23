/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
  
  // ============ SECURITY HEADERS ============
  // Addresses: CSP, Clickjacking (X-Frame-Options), and other OWASP Top 10 issues
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          // Content Security Policy - Mitigates XSS and data injection attacks
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: self + inline (needed for Next.js) + specific trusted CDNs
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
              // Styles: self + inline (needed for Tailwind/styled-jsx)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Images: self + data URIs + blockchain/crypto image sources
              "img-src 'self' data: blob: https: https://*.walletconnect.com https://*.coinbase.com",
              // Fonts: self + Google Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // Connect: API endpoints, RPC nodes, WalletConnect, etc.
              "connect-src 'self' https://*.upstash.io https://mainnet.base.org https://base.llamarpc.com https://base-mainnet.public.blastapi.io https://1rpc.io https://*.walletconnect.com wss://*.walletconnect.com https://*.coinbase.com https://api.developer.coinbase.com https://pay.coinbase.com https://*.basegold.io",
              // Frames: prevent clickjacking
              "frame-ancestors 'none'",
              // Frame-src: allow Coinbase Pay iframe
              "frame-src 'self' https://pay.coinbase.com https://*.coinbase.com",
              // Object/base restrictions
              "object-src 'none'",
              "base-uri 'self'",
              // Form submissions
              "form-action 'self'",
              // Upgrade insecure requests
              "upgrade-insecure-requests"
            ].join('; ')
          },
          // X-Frame-Options - Prevents clickjacking (legacy browser support)
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // X-Content-Type-Options - Prevents MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // Referrer-Policy - Controls referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // X-XSS-Protection - Legacy XSS protection (for older browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          // Permissions-Policy - Restricts browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          // Strict-Transport-Security - Forces HTTPS
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
