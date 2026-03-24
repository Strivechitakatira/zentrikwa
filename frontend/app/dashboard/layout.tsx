import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/server';
import SignOutButton from '@/components/SignOutButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center border-b border-gray-200 px-6">
          <span className="text-lg font-bold tracking-tight text-gray-900">Conva</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'WhatsApp', href: '/dashboard/whatsapp' },
            { label: 'Conversations', href: '/dashboard/conversations' },
            { label: 'Contacts', href: '/dashboard/contacts' },
            { label: 'Campaigns', href: '/dashboard/campaigns' },
            { label: 'Analytics', href: '/dashboard/analytics' },
            { label: 'Settings', href: '/dashboard/settings' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <p className="mb-2 truncate text-xs text-gray-400">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
