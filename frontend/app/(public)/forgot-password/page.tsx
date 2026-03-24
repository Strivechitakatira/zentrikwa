'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createBrowserClient } from '@/lib/auth/client';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    const supabase = createBrowserClient();

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
        <p className="mt-2 text-sm text-gray-500">
          We&apos;ve sent a password reset link. It expires in 1 hour.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold text-gray-900">Reset your password</h1>
      <p className="mb-6 text-sm text-gray-500">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="you@company.com"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        {serverError && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/login" className="text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
