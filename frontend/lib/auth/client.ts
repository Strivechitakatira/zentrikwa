/**
 * Supabase client for use in Client Components ("use client").
 *
 * Uses @supabase/ssr createBrowserClient — handles cookie-based sessions
 * compatible with Next.js App Router.
 */
import { createBrowserClient as _createBrowserClient } from '@supabase/ssr';

export function createBrowserClient() {
  return _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** @deprecated use createBrowserClient */
export const createSupabaseClient = createBrowserClient;
