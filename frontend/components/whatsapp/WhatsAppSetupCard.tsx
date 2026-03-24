'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  completeEmbeddedSignup,
  connectWhatsApp,
  disconnectWhatsApp,
  type WhatsAppStatusResponse,
} from '@/lib/api/whatsapp';

// ── Types ──────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    FB: {
      init: (opts: object) => void;
      login: (cb: (res: FacebookLoginResponse) => void, opts: object) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface FacebookLoginResponse {
  authResponse?: { code: string };
  status: string;
}

interface WaEmbeddedSignupEvent {
  type: string;
  event: 'FINISH' | 'CANCEL' | 'ERROR';
  data?: { phone_number_id: string; waba_id: string };
}

// ── Manual form schema (advanced / fallback) ──────────────────────────────────

const manualSchema = z.object({
  phone_number_id: z.string().min(1, 'Required'),
  waba_id: z.string().min(1, 'Required'),
  access_token: z.string().min(10, 'Required'),
  display_name: z.string().optional(),
  phone_number: z.string().optional(),
});
type ManualFormData = z.infer<typeof manualSchema>;

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  metaAppId: string;
  configId: string;
  initialStatus: WhatsAppStatusResponse | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WhatsAppSetupCard({
  token,
  metaAppId,
  configId,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<WhatsAppStatusResponse | null>(initialStatus);
  const [serverError, setServerError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [fbLoaded, setFbLoaded] = useState(false);
  const wabaDataRef = useRef<{ phone_number_id: string; waba_id: string } | null>(null);

  // ── Load Facebook JS SDK ───────────────────────────────────────────────────
  useEffect(() => {
    const initSDK = () => {
      window.FB.init({
        appId: metaAppId,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v18.0',
      });
      setFbLoaded(true);
    };

    // Already loaded (remount / HMR)
    if (window.FB) {
      initSDK();
      return;
    }

    // Script already in DOM — SDK is mid-load, set callback and wait
    if (document.getElementById('facebook-jssdk')) {
      window.fbAsyncInit = initSDK;
      return;
    }

    // Fresh load — inject script
    window.fbAsyncInit = initSDK;
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    // onload fires when script finishes parsing — FB calls fbAsyncInit itself,
    // but if it doesn't (cached / timing), we call it manually here.
    script.onload = () => {
      if (window.FB && !document.getElementById('fb-sdk-ready')) {
        initSDK();
      }
    };
    script.onerror = () => {
      setServerError('Connection to Facebook failed. Please refresh the page and try again.');
    };
    document.body.appendChild(script);

    // Listen for WA_EMBEDDED_SIGNUP message to capture waba_id + phone_number_id
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com') return;
      try {
        const data: WaEmbeddedSignupEvent = JSON.parse(event.data as string);
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH' && data.data) {
          wabaDataRef.current = {
            phone_number_id: data.data.phone_number_id,
            waba_id: data.data.waba_id,
          };
        }
      } catch {
        // non-JSON messages — ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [metaAppId]);

  // ── Embedded Signup handler ────────────────────────────────────────────────
  const handleEmbeddedSignup = () => {
    setServerError(null);
    wabaDataRef.current = null;

    window.FB.login(
      async (response: FacebookLoginResponse) => {
        if (!response.authResponse?.code) {
          if (response.status !== 'connected') {
            setServerError('Facebook login was cancelled or failed.');
          }
          return;
        }

        const wabaData = wabaDataRef.current;
        if (!wabaData) {
          setServerError(
            'Could not capture WhatsApp account details. Please try again or use manual setup.',
          );
          return;
        }

        setConnecting(true);
        try {
          const account = await completeEmbeddedSignup(token, {
            code: response.authResponse.code,
            phone_number_id: wabaData.phone_number_id,
            waba_id: wabaData.waba_id,
          });
          setStatus({ connected: true, account });
          router.refresh();
        } catch (err) {
          setServerError(err instanceof Error ? err.message : 'Connection failed');
        } finally {
          setConnecting(false);
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '2',
        },
      },
    );
  };

  // ── Disconnect handler ─────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!confirm('Disconnect your WhatsApp account? Messages will stop being received.')) return;
    setDisconnecting(true);
    setServerError(null);
    try {
      await disconnectWhatsApp(token);
      setStatus({ connected: false, account: null });
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Manual form ────────────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ManualFormData>({ resolver: zodResolver(manualSchema) });

  const onManualSubmit = async (data: ManualFormData) => {
    setServerError(null);
    try {
      const account = await connectWhatsApp(token, data);
      setStatus({ connected: true, account });
      reset();
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  // ── Connected state ────────────────────────────────────────────────────────
  if (status?.connected && status.account) {
    const acct = status.account;
    return (
      <div className="rounded-lg border border-green-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <WhatsAppIcon className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {acct.display_name ?? 'WhatsApp Connected'}
              </p>
              <p className="text-xs text-gray-500">{acct.phone_number ?? acct.phone_number_id}</p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Active
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded-md bg-gray-50 p-4 text-xs">
          <div>
            <p className="font-medium text-gray-500">Phone Number ID</p>
            <p className="mt-0.5 font-mono text-gray-700">{acct.phone_number_id}</p>
          </div>
          <div>
            <p className="font-medium text-gray-500">WABA ID</p>
            <p className="mt-0.5 font-mono text-gray-700">{acct.waba_id}</p>
          </div>
          {acct.verified_at && (
            <div>
              <p className="font-medium text-gray-500">Connected</p>
              <p className="mt-0.5 text-gray-700">
                {new Date(acct.verified_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {serverError && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => { setStatus(null); setShowManual(false); }}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Reconnect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>
    );
  }

  // ── Setup state ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <WhatsAppIcon className="h-5 w-5 text-gray-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Connect WhatsApp Business</h2>
          <p className="text-xs text-gray-500">
            Sign in with Facebook to connect your WhatsApp Business account
          </p>
        </div>
      </div>

      {!showManual ? (
        <div className="mt-6 space-y-4">
          {/* Primary CTA — Embedded Signup */}
          <button
            onClick={handleEmbeddedSignup}
            disabled={!fbLoaded || connecting}
            className="flex w-full items-center justify-center gap-3 rounded-md bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60"
          >
            {connecting ? (
              <>
                <Spinner />
                Connecting…
              </>
            ) : !fbLoaded ? (
              <>
                <Spinner />
                Loading…
              </>
            ) : (
              <>
                <FacebookIcon className="h-5 w-5" />
                Continue with Facebook
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            You&apos;ll be prompted to log in to Facebook and select your WhatsApp Business Account.
            Your access token is encrypted and stored securely.
          </p>

          {serverError && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          {/* Manual entry hidden — not suitable for non-technical users */}
        </div>
      ) : (
        /* Manual / advanced form */
        <form onSubmit={handleSubmit(onManualSubmit)} className="mt-6 space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="phone_number_id" className="block text-sm font-medium text-gray-700">
                Phone Number ID <span className="text-red-500">*</span>
              </label>
              <input
                id="phone_number_id"
                {...register('phone_number_id')}
                placeholder="123456789012345"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {errors.phone_number_id && (
                <p className="mt-1 text-xs text-red-600">{errors.phone_number_id.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="waba_id" className="block text-sm font-medium text-gray-700">
                WABA ID <span className="text-red-500">*</span>
              </label>
              <input
                id="waba_id"
                {...register('waba_id')}
                placeholder="987654321098765"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {errors.waba_id && (
                <p className="mt-1 text-xs text-red-600">{errors.waba_id.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="access_token" className="block text-sm font-medium text-gray-700">
              Permanent Access Token <span className="text-red-500">*</span>
            </label>
            <input
              id="access_token"
              type="password"
              {...register('access_token')}
              placeholder="EAAxxxxxxxx…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {errors.access_token && (
              <p className="mt-1 text-xs text-red-600">{errors.access_token.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="display_name" className="block text-sm font-medium text-gray-700">
                Display name
              </label>
              <input
                id="display_name"
                {...register('display_name')}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                Phone number
              </label>
              <input
                id="phone_number"
                {...register('phone_number')}
                placeholder="+263771234567"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {serverError && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowManual(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
