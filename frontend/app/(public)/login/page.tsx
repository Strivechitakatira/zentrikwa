'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createBrowserClient } from '@/lib/auth/client';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
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
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) { setServerError(error.message); return; }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold text-txt-primary">Sign in to your account</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email" type="email" autoComplete="email"
            {...register('email')}
            className="input-field mt-1"
            placeholder="you@company.com"
          />
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">Password</label>
            <Link href="/forgot-password" className="link text-xs">Forgot password?</Link>
          </div>
          <input
            id="password" type="password" autoComplete="current-password"
            {...register('password')}
            className="input-field mt-1"
          />
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
        </div>

        {serverError && <div className="error-box">{serverError}</div>}

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-txt-secondary">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="link">Sign up</Link>
      </p>
    </>
  );
}
