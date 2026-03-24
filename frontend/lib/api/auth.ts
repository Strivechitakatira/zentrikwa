/**
 * API client for the auth domain.
 * Calls FastAPI endpoints defined in backend/app/routers/auth.py.
 *
 * Note: types are hand-written here because openapi-ts requires the backend
 * to be running. Regenerate with `pnpm openapi-ts` once the server is live.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface UserResponse {
  id: string;
  email: string;
  full_name: string | null;
  client_id: string;
  role: string;
}

export interface SignupCompleteRequest {
  company_name: string;
  full_name: string;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? body?.detail ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Called immediately after email verification.
 * Creates the tenant (client) record and sets the user's role to "owner".
 */
export async function completeSignup(
  token: string,
  body: SignupCompleteRequest,
): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/v1/auth/complete-signup', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

/**
 * Fetch the current user's profile from the backend.
 */
export async function getMe(token: string): Promise<UserResponse> {
  return apiFetch<UserResponse>('/api/v1/auth/me', { token });
}
