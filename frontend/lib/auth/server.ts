/**
 * Supabase clients for server-side use.
 *
 * createSupabaseServerClient — for Server Components (reads cookies via next/headers)
 * createServerClient        — for Route Handlers and middleware (accepts NextResponse)
 */
import { createServerClient as _createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

/** Server Component client. Reads + writes cookies via next/headers. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
            });
          } catch {
            // Server Component — cookies can't always be written
          }
        },
      },
    },
  );
}

/**
 * Route Handler / middleware client.
 * Writes session cookies onto the provided NextResponse so they are sent back
 * to the browser.
 */
export function createServerClient(response: NextResponse) {
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // In a Route Handler we don't have access to the request cookies here,
          // but exchangeCodeForSession sends the code in the URL, not cookies.
          return [];
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
          });
        },
      },
    },
  );
}
