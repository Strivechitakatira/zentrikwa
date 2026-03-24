import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle, Search, Bot, UserCheck, CheckCheck } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { listConversations, type Conversation } from '@/lib/api/conversations';

export const dynamic = 'force-dynamic';

function statusBadge(status: Conversation['status']) {
  if (status === 'bot')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
        <Bot className="h-3 w-3" /> AI
      </span>
    );
  if (status === 'open')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">
        <UserCheck className="h-3 w-3" /> Open
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
      <CheckCheck className="h-3 w-3" /> Closed
    </span>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function initials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return phone.slice(-2);
}

export default async function ConversationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  let conversations: Conversation[] = [];
  let total = 0;

  try {
    const result = await listConversations(session.access_token, { page_size: 50 });
    conversations = result.items;
    total = result.total;
  } catch {
    // Show empty state on error — backend may not be reachable in dev
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-txt-primary">Conversations</h1>
          <p className="mt-0.5 text-sm text-txt-secondary">
            {total > 0 ? `${total} conversation${total !== 1 ? 's' : ''}` : 'No conversations yet'}
          </p>
        </div>
        {/* Search placeholder — wire up with client component later */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-base px-3 py-2 text-sm text-txt-muted">
          <Search className="h-4 w-4" />
          <span>Search…</span>
        </div>
      </div>

      {/* List */}
      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-subtle">
            <MessageCircle className="h-8 w-8 text-accent" />
          </div>
          <div>
            <p className="font-medium text-txt-primary">No conversations yet</p>
            <p className="mt-1 text-sm text-txt-secondary">
              Messages from your WhatsApp customers will appear here.
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-border">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <Link
                href={`/dashboard/conversations/${conv.id}`}
                className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-surface"
              >
                {/* Avatar */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent">
                  {initials(conv.contact?.name ?? null, conv.contact_phone)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-txt-primary">
                      {conv.contact?.name ?? conv.contact_phone}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      {statusBadge(conv.status)}
                      <span className="text-xs text-txt-muted">{timeAgo(conv.last_message_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="truncate text-sm text-txt-secondary">
                      {conv.last_message ?? 'No messages yet'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-txt-muted">{conv.contact_phone}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
