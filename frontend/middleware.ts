import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email'];

/**
 * Middleware runs on every matched request.
 *
 * Responsibilities:
 *  1. Security headers on all responses
 *  2. Auth redirect: unauthenticated users hitting /dashboard → /login
 *  3. Dashboard redirect: authenticated users on /login|/signup → /dashboard
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Pass-through for auth callback — Supabase redirects here with a code
  if (pathname.startsWith('/api/auth/callback')) {
    return NextResponse.next();
  }

  // Create a mutable response so Supabase SSR can refresh session cookies
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]),
          );
        },
      },
    },
  );

  // Refresh the session — required for @supabase/ssr to keep the token alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isDashboard = pathname.startsWith('/dashboard');

  // Unauthenticated user trying to access the dashboard
  if (!user && isDashboard) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user landing on a public auth page
  if (user && isPublicPath) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // ── Security headers ────────────────────────────────────────────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseUrl} ${apiUrl} wss://*.supabase.co`,
      "frame-ancestors 'none'",
    ].join('; '),
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *  - _next/static (static files)
     *  - _next/image  (image optimization)
     *  - favicon.ico
     *  - /api/webhooks/* (Meta webhook — must not redirect)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|api/webhooks).*)',
  ],
};
