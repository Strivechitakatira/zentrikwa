'use client';

import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/auth/client';

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    >
      Sign out
    </button>
  );
}
