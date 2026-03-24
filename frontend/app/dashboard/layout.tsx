import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/server';
import Sidebar from '@/components/dashboard/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const userName: string | undefined = user.user_metadata?.full_name;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userEmail={user.email ?? ''}
        userName={userName}
      />
      <main className="flex-1 overflow-y-auto bg-base">
        <div className="mx-auto max-w-6xl p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
