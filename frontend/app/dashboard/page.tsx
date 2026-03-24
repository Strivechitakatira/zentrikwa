import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/server';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const fullName: string = user.user_metadata?.full_name ?? user.email ?? 'there';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome back, {fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s what&apos;s happening with your WhatsApp assistant today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Conversations', value: '—' },
          { label: 'New leads', value: '—' },
          { label: 'Messages sent', value: '—' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-gray-900">Connect your WhatsApp account</p>
        <p className="mt-1 text-xs text-gray-500">
          Link your Meta WhatsApp Business account to start receiving and responding to messages.
        </p>
        <button
          disabled
          className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white opacity-60"
        >
          Connect WhatsApp — coming soon
        </button>
      </div>
    </div>
  );
}
