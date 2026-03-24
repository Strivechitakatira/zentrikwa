import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/server';
import { getWhatsAppStatus } from '@/lib/api/whatsapp';
import WhatsAppSetupCard from '@/components/whatsapp/WhatsAppSetupCard';

export default async function WhatsAppPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  let status = null;
  try {
    status = await getWhatsAppStatus(session.access_token);
  } catch {
    // Backend may be starting up — page still renders with empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">WhatsApp Account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect your Meta WhatsApp Business account to start receiving and responding to messages.
        </p>
      </div>

      <WhatsAppSetupCard
        token={session.access_token}
        metaAppId={process.env.NEXT_PUBLIC_META_APP_ID ?? ''}
        configId={process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ?? ''}
        initialStatus={status}
      />
    </div>
  );
}
