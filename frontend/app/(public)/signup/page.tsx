'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createBrowserClient } from '@/lib/auth/client';
import { completeSignup } from '@/lib/api/auth';

const schema = z.object({
  full_name:    z.string().min(1, 'Full name is required').max(255),
  company_name: z.string().min(1, 'Company name is required').max(255),
  email:        z.string().email('Enter a valid email'),
  password:     z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
});

type FormData = z.infer<typeof schema>;

export default function SignupPage() {
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

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        data: { full_name: data.full_name, company_name: data.company_name },
      },
    });

    if (authError) { setServerError(authError.message); return; }

    if (authData.session) {
      try {
        await completeSignup(authData.session.access_token, {
          company_name: data.company_name,
          full_name: data.full_name,
        });
        router.push('/dashboard');
        router.refresh();
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Setup failed');
      }
      return;
    }

    sessionStorage.setItem(
      'pending_signup',
      JSON.stringify({ company_name: data.company_name, full_name: data.full_name }),
    );
    router.push('/verify-email');
  };

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold text-txt-primary">Create your account</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="full_name" className="label">Full name</label>
          <input id="full_name" type="text" autoComplete="name"
            {...register('full_name')} className="input-field mt-1" placeholder="Jane Smith" />
          {errors.full_name && <p className="mt-1 text-xs text-danger">{errors.full_name.message}</p>}
        </div>

        <div>
          <label htmlFor="company_name" className="label">Company name</label>
          <input id="company_name" type="text" autoComplete="organization"
            {...register('company_name')} className="input-field mt-1" placeholder="Acme Ltd" />
          {errors.company_name && <p className="mt-1 text-xs text-danger">{errors.company_name.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className="label">Work email</label>
          <input id="email" type="email" autoComplete="email"
            {...register('email')} className="input-field mt-1" placeholder="you@company.com" />
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" autoComplete="new-password"
            {...register('password')} className="input-field mt-1" />
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
          <p className="mt-1 text-xs text-txt-muted">Min 8 characters, one uppercase, one number</p>
        </div>

        {serverError && <div className="error-box">{serverError}</div>}

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-txt-secondary">
        Already have an account?{' '}
        <Link href="/login" className="link">Sign in</Link>
      </p>
    </>
  );
}
