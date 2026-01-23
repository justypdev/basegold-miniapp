import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============ CORS & SECURITY MIDDLEWARE ============
// Addresses: CORS misconfiguration (CWE-942/CWE-16)
// Reference: OWASP Top 10 - Security Misconfiguration

// Allowed origins - ONLY your domains should be listed here
const ALLOWED_ORIGINS = [
  'https://basegold.io',
  'https://www.basegold.io',
  'https://miner.basegold.io',
  'https://goldvein.basegold.io',
  // Add localhost for development
  'http://localhost:3000',
  'http://localhost:3001',
];

// Check if origin is allowed
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.basegold.io')
  );
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const response = NextResponse.next();
  
  // ============ CORS HANDLING FOR API ROUTES ============
  if (request.nextUrl.pathname.startsWith('/api/')) {
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const preflightResponse = new NextResponse(null, { status: 204 });
      
      if (origin && isAllowedOrigin(origin)) {
        preflightResponse.headers.set('Access-Control-Allow-Origin', origin);
        preflightResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        preflightResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        preflightResponse.headers.set('Access-Control-Max-Age', '86400');
      }
      
      return preflightResponse;
    }
    
    // For actual requests, only set CORS headers if origin is allowed
    if (origin && isAllowedOrigin(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    // If origin is not allowed, don't set any CORS headers
    // This enforces same-origin policy for unauthorized domains
  }
  
  // ============ ADDITIONAL SECURITY HEADERS ============
  // These supplement the headers in next.config.js
  
  // Prevent caching of sensitive API responses
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  
  return response;
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Optionally match other routes that need CORS handling
  ],
};
