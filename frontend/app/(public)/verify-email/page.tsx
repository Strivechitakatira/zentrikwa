import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Verify your email' };

export default function VerifyEmailPage() {
  return (
    <div className="text-center">
      <div className="mb-4 flex justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
          <svg
            className="h-6 w-6 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-900">Check your inbox</h2>
      <p className="mt-2 text-sm text-gray-500">
        We&apos;ve sent a verification link to your email address. Click the link to activate
        your account and set up your workspace.
      </p>
      <p className="mt-2 text-xs text-gray-400">
        The link expires in 24 hours. Check your spam folder if you don&apos;t see it.
      </p>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <p className="text-sm text-gray-500">
          Wrong email?{' '}
          <Link href="/signup" className="text-indigo-600 hover:underline">
            Start over
          </Link>
        </p>
      </div>
    </div>
  );
}
