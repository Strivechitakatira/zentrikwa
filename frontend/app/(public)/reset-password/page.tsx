'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createBrowserClient } from '@/lib/auth/client';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    const supabase = createBrowserClient();

    const { error } = await supabase.auth.updateUser({ password: data.password });

    if (error) {
      setServerError(error.message);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold text-gray-900">Set new password</h1>
      <p className="mb-6 text-sm text-gray-500">Choose a strong password for your account.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
          <p className="mt-1 text-xs text-gray-400">Min 8 characters, one uppercase, one number</p>
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            {...register('confirm')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {errors.confirm && (
            <p className="mt-1 text-xs text-red-600">{errors.confirm.message}</p>
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
          {isSubmitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}
