'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, UserCheck, CheckCheck, ChevronDown } from 'lucide-react';
import { updateConversation } from '@/lib/api/conversations';

type Status = 'bot' | 'open' | 'closed';

const STATUS_OPTIONS: { value: Status; label: string; icon: typeof Bot }[] = [
  { value: 'bot', label: 'AI handling', icon: Bot },
  { value: 'open', label: 'Open', icon: UserCheck },
  { value: 'closed', label: 'Closed', icon: CheckCheck },
];

const STATUS_COLORS: Record<Status, string> = {
  bot: 'text-accent bg-accent-subtle border-accent/20',
  open: 'text-warning bg-warning-subtle border-warning/20',
  closed: 'text-success bg-success-subtle border-success/20',
};

interface Props {
  conversationId: string;
  currentStatus: Status;
  token: string;
}

export function ConversationActions({ conversationId, currentStatus, token }: Props) {
  const [status, setStatus] = useState<Status>(currentStatus);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const current = STATUS_OPTIONS.find((o) => o.value === status)!;
  const CurrentIcon = current.icon;

  function changeStatus(next: Status) {
    if (next === status) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(async () => {
      try {
        await updateConversation(token, conversationId, { status: next });
        setStatus(next);
        router.refresh();
      } catch {
        // Silent fail — UI will be stale but functional on next load
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${STATUS_COLORS[status]} disabled:opacity-50`}
        aria-label="Change conversation status"
      >
        <CurrentIcon className="h-3.5 w-3.5" />
        {current.label}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-xl border border-border bg-surface py-1 shadow-card-hover">
            {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => changeStatus(value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-base ${
                  value === status ? 'font-medium text-accent' : 'text-txt-primary'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
