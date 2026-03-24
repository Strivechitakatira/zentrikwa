/**
 * API client for the WhatsApp account domain.
 * Calls FastAPI endpoints defined in backend/app/routers/whatsapp.py.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface WhatsAppAccount {
  id: string;
  phone_number_id: string;
  waba_id: string;
  display_name: string | null;
  phone_number: string | null;
  is_active: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppStatusResponse {
  connected: boolean;
  account: WhatsAppAccount | null;
}

export interface EmbeddedSignupRequest {
  code: string;
  phone_number_id: string;
  waba_id: string;
}

export interface WhatsAppConnectRequest {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  display_name?: string;
  phone_number?: string;
}

async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? body?.detail ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function completeEmbeddedSignup(
  token: string,
  body: EmbeddedSignupRequest,
): Promise<WhatsAppAccount> {
  return apiFetch<WhatsAppAccount>('/api/v1/whatsapp/embedded-signup', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getWhatsAppStatus(token: string): Promise<WhatsAppStatusResponse> {
  return apiFetch<WhatsAppStatusResponse>('/api/v1/whatsapp/status', token);
}

export async function connectWhatsApp(
  token: string,
  body: WhatsAppConnectRequest,
): Promise<WhatsAppAccount> {
  return apiFetch<WhatsAppAccount>('/api/v1/whatsapp/connect', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function disconnectWhatsApp(token: string): Promise<void> {
  return apiFetch<void>('/api/v1/whatsapp/disconnect', token, { method: 'DELETE' });
}
