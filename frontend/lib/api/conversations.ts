/**
 * API client for the conversations domain.
 * Calls FastAPI endpoints defined in backend/app/routers/conversations.py.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  contact_phone: string;
  status: 'bot' | 'open' | 'closed';
  unread_count: number;
  last_message_at: string | null;
  last_message: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  contact: Contact | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body: string | null;
  media_url: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  created_at: string;
}

export interface ConversationListResponse {
  items: Conversation[];
  total: number;
  page: number;
  page_size: number;
}

export interface ConversationThreadResponse {
  conversation: Conversation;
  messages: Message[];
  total_messages: number;
}

async function apiFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? body?.detail ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function listConversations(
  token: string,
  params?: { page?: number; page_size?: number; status?: string },
): Promise<ConversationListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.page_size) query.set('page_size', String(params.page_size));
  if (params?.status) query.set('status', params.status);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<ConversationListResponse>(`/api/v1/conversations${qs}`, token);
}

export async function getConversationThread(
  token: string,
  conversationId: string,
): Promise<ConversationThreadResponse> {
  return apiFetch<ConversationThreadResponse>(
    `/api/v1/conversations/${conversationId}`,
    token,
  );
}

export async function updateConversation(
  token: string,
  conversationId: string,
  data: { status?: string; assigned_to?: string },
): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/v1/conversations/${conversationId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
