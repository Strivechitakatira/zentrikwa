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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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

      {/* Webhook URL card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Webhook URL</h2>
        <p className="mt-1 text-xs text-gray-500">
          Register this in Meta Developer Portal → Your App → WhatsApp → Configuration → Webhooks.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
          <code className="flex-1 truncate text-xs text-gray-700">
            {apiUrl}/api/v1/webhooks/whatsapp
          </code>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Verify token:{' '}
          <code className="text-gray-600">META_WEBHOOK_VERIFY_TOKEN</code> from your backend{' '}
          <code className="text-gray-600">.env</code>
        </p>
      </div>
    </div>
  );
}
