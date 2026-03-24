import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { MessageCircle, Users, Send, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const STATS = [
  { label: 'Conversations',  value: '—', icon: MessageCircle, color: 'text-accent',   bg: 'bg-accent-subtle' },
  { label: 'Contacts',       value: '—', icon: Users,          color: 'text-success',  bg: 'bg-success-subtle' },
  { label: 'Messages Sent',  value: '—', icon: Send,           color: 'text-warning',  bg: 'bg-warning-subtle' },
  { label: 'Response Rate',  value: '—', icon: TrendingUp,     color: 'text-danger',   bg: 'bg-danger-subtle' },
];

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const firstName = (user.user_metadata?.full_name as string | undefined)
    ?.split(' ')[0] ?? 'there';

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-txt-primary">
          {greeting}, {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-txt-secondary">
          Here&apos;s what&apos;s happening with your WhatsApp assistant today.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-surface p-5 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-txt-secondary">{label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-txt-primary">{value}</p>
            <p className="mt-1 text-xs text-txt-muted">No data yet</p>
          </div>
        ))}
      </div>

      {/* Connect CTA */}
      <div className="relative overflow-hidden rounded-xl border border-accent/20 bg-accent-subtle p-6">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-txt-primary">
              Connect your WhatsApp account
            </h2>
            <p className="mt-1 text-sm text-txt-secondary">
              Link your Meta WhatsApp Business account to start receiving and responding to messages with AI.
            </p>
          </div>
          <Link
            href="/dashboard/whatsapp"
            className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/10" />
        <div className="absolute -bottom-4 right-16 h-20 w-20 rounded-full bg-accent/5" />
      </div>

      {/* Recent activity placeholder */}
      <div className="rounded-xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-txt-primary">Recent Conversations</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-base">
            <MessageCircle className="h-5 w-5 text-txt-muted" />
          </div>
          <p className="mt-3 text-sm font-medium text-txt-secondary">No conversations yet</p>
          <p className="mt-1 text-xs text-txt-muted">
            Once you connect WhatsApp, conversations will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
