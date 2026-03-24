/**
 * Typed HTTP client for the Conva FastAPI backend.
 *
 * All API calls go through this client — never call fetch() directly in components.
 * Types are generated from FastAPI's OpenAPI spec via `pnpm openapi-ts`.
 *
 * Usage in lib/api/<domain>.ts:
 *   import { client } from './client';
 *   const { data, error } = await client.GET('/api/contacts', { ... });
 */
import { createClient } from '@hey-api/client-fetch';

export const client = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
});

/**
 * Set the Supabase auth token on the client.
 * Call this after the user signs in.
 *
 * Example:
 *   const { data: { session } } = await supabase.auth.getSession()
 *   if (session) setAuthToken(session.access_token)
 */
export function setAuthToken(token: string): void {
  client.setConfig({
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function clearAuthToken(): void {
  client.setConfig({ headers: {} });
}
