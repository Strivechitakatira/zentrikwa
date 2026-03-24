'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createBrowserClient } from '@/lib/auth/client';

const schema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
});

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) { setServerError(error.message); return; }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold text-txt-primary">Set new password</h1>
      <p className="mb-6 text-sm text-txt-secondary">Choose a strong password for your account.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="password" className="label">New password</label>
          <input id="password" type="password" autoComplete="new-password"
            {...register('password')} className="input-field mt-1" />
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
          <p className="mt-1 text-xs text-txt-muted">Min 8 characters, one uppercase, one number</p>
        </div>

        <div>
          <label htmlFor="confirm" className="label">Confirm password</label>
          <input id="confirm" type="password" autoComplete="new-password"
            {...register('confirm')} className="input-field mt-1" />
          {errors.confirm && <p className="mt-1 text-xs text-danger">{errors.confirm.message}</p>}
        </div>

        {serverError && <div className="error-box">{serverError}</div>}

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}
