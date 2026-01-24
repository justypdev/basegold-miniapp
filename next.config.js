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
  // Reown/WalletConnect CSP: https://docs.reown.com/advanced/security/content-security-policy
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
              // Images: self + data URIs + blockchain/crypto image sources (per Reown docs)
              "img-src 'self' data: blob: https: https://walletconnect.org https://walletconnect.com https://secure.walletconnect.com https://secure.walletconnect.org https://tokens-data.1inch.io https://tokens.1inch.io https://ipfs.io https://cdn.zerion.io",
              // Fonts: self + Google Fonts + Reown fonts
              "font-src 'self' https://fonts.gstatic.com https://fonts.reown.com",
              // Connect: Full Reown/WalletConnect CSP + RPC nodes + APIs
              "connect-src 'self' " + [
                // Upstash Redis
                "https://*.upstash.io",
                // Base RPC endpoints
                "https://mainnet.base.org",
                "https://base.llamarpc.com", 
                "https://base-mainnet.public.blastapi.io",
                "https://base.publicnode.com",
                "https://1rpc.io",
                // Reown/WalletConnect (from official docs)
                "https://rpc.walletconnect.com",
                "https://rpc.walletconnect.org",
                "https://relay.walletconnect.com",
                "https://relay.walletconnect.org",
                "wss://relay.walletconnect.com",
                "wss://relay.walletconnect.org",
                "https://pulse.walletconnect.com",
                "https://pulse.walletconnect.org",
                "https://api.web3modal.com",
                "https://api.web3modal.org",
                "https://keys.walletconnect.com",
                "https://keys.walletconnect.org",
                "https://notify.walletconnect.com",
                "https://notify.walletconnect.org",
                "https://echo.walletconnect.com",
                "https://echo.walletconnect.org",
                "https://push.walletconnect.com",
                "https://push.walletconnect.org",
                // Coinbase
                "https://*.coinbase.com",
                "https://api.developer.coinbase.com",
                "https://pay.coinbase.com",
                "wss://www.walletlink.org",
                // BaseGold
                "https://*.basegold.io"
              ].join(" "),
              // Frames: prevent clickjacking
              "frame-ancestors 'none'",
              // Frame-src: allow Coinbase Pay iframe + WalletConnect
              "frame-src 'self' https://pay.coinbase.com https://*.coinbase.com https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://secure.walletconnect.org",
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
