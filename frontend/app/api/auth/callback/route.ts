/**
 * Supabase Auth PKCE callback route.
 *
 * Supabase redirects here after:
 *   - Email verification (signup)
 *   - Password reset
 *   - Magic link login
 *
 * The route exchanges the one-time `code` for a session cookie, then:
 *   - For new signups: calls POST /auth/complete-signup to create the tenant
 *   - For password resets: redirects to /reset-password
 *   - Otherwise: redirects to /dashboard
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/auth/server';
import { completeSignup } from '@/lib/api/auth';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(response);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error?.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Password reset flow — just redirect to the reset page (session is set)
  if (next === '/reset-password') {
    return response;
  }

  // New signup flow — create tenant if not already set up
  // The signup page stores company/full_name in sessionStorage, but since this
  // is a server route we rely on the user metadata set during signUp().
  const user = data.session.user;
  const fullName: string = user.user_metadata?.full_name ?? '';

  // Check if this user already has a tenant (repeat callback visit)
  // We optimistically call complete-signup; the service layer is idempotent.
  const companyName: string = user.user_metadata?.company_name ?? fullName;

  if (fullName || companyName) {
    try {
      await completeSignup(data.session.access_token, {
        company_name: companyName || 'My Company',
        full_name: fullName || (user.email ?? 'User'),
      });
    } catch (err) {
      // If setup fails (e.g. already exists), swallow — user can retry from dashboard
      console.warn('[auth/callback] complete-signup error (non-fatal):', err);
    }
  }

  return response;
}
