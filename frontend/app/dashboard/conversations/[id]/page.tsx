import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bot, UserCheck, CheckCheck, Phone } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { getConversationThread, type Message, type Conversation } from '@/lib/api/conversations';
import { ConversationActions } from '@/components/conversations/ConversationActions';

export const dynamic = 'force-dynamic';

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status: Conversation['status']) {
  if (status === 'bot') return { icon: Bot, label: 'AI handling', cls: 'text-accent' };
  if (status === 'open') return { icon: UserCheck, label: 'Agent open', cls: 'text-warning' };
  return { icon: CheckCheck, label: 'Closed', cls: 'text-success' };
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === 'outbound';
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
          isOut
            ? 'rounded-br-sm bg-accent text-white'
            : 'rounded-bl-sm bg-surface border border-border text-txt-primary'
        }`}
      >
        {msg.body ? (
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        ) : (
          <p className={`italic ${isOut ? 'text-white/70' : 'text-txt-muted'}`}>
            [{msg.type} message]
          </p>
        )}
        <p
          className={`mt-1 text-right text-[10px] ${
            isOut ? 'text-white/60' : 'text-txt-muted'
          }`}
        >
          {timeLabel(msg.created_at)}
        </p>
      </div>
    </div>
  );
}

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  let thread;
  try {
    thread = await getConversationThread(session.access_token, id);
  } catch {
    notFound();
  }

  const { conversation, messages } = thread;
  const contact = conversation.contact;
  const displayName = contact?.name ?? conversation.contact_phone;
  const { icon: StatusIcon, label: statusText, cls: statusCls } = statusLabel(conversation.status);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Thread header */}
      <div className="flex items-center gap-4 border-b border-border bg-surface px-4 py-3">
        <Link
          href="/dashboard/conversations"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-txt-secondary transition-colors hover:bg-base hover:text-txt-primary"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent">
          {displayName.length >= 2
            ? displayName.slice(0, 2).toUpperCase()
            : displayName.toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-txt-primary">{displayName}</p>
          <div className="flex items-center gap-2">
            <Phone className="h-3 w-3 text-txt-muted" />
            <span className="text-xs text-txt-muted">{conversation.contact_phone}</span>
            <StatusIcon className={`h-3 w-3 ${statusCls}`} />
            <span className={`text-xs ${statusCls}`}>{statusText}</span>
          </div>
        </div>

        {/* Status actions — client component */}
        <ConversationActions
          conversationId={id}
          currentStatus={conversation.status}
          token={session.access_token}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-txt-muted">
            No messages yet
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </div>
        )}
      </div>

      {/* Compose area — read-only for now (outbound via AI only) */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-base px-4 py-2.5 text-sm text-txt-muted">
          <Bot className="h-4 w-4 text-accent" />
          <span>AI is handling this conversation. Set to &ldquo;Open&rdquo; to assign to an agent.</span>
        </div>
      </div>
    </div>
  );
}
