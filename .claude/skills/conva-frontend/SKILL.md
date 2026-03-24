---
name: conva-frontend
description: Use when building Next.js frontend pages, components, or API client functions for the Conva (ZentrikAI) dashboard. Trigger for "dashboard page", "frontend component", "UI for", "build the page", "add to dashboard", "frontend form", "call the API from frontend", or any task that creates or modifies files in frontend/. Do NOT use for backend-only tasks.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use this skill for **any task that creates or modifies files in `frontend/`** of the ZentrikAI monorepo.

**Must use:** dashboard pages, reusable components, API client functions, auth helpers, layout files, middleware, TypeScript types.

**Skip:** FastAPI routes (use `fastapi-route`), DB migrations (use `db-schema-rls`), full end-to-end features (use `conva-feature`), WhatsApp pipeline (use `whatsapp-pipeline`).

---

## Folder Structure

```
frontend/
├── app/
│   ├── (public)/               # Marketing + auth — no auth required
│   │   ├── layout.tsx
│   │   ├── page.tsx            # Landing
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   └── dashboard/              # Tenant dashboard — auth required
│       ├── layout.tsx          # Session guard + sidebar
│       ├── page.tsx            # Overview
│       ├── inbox/
│       ├── agent/
│       ├── leads/
│       ├── campaigns/
│       ├── business/
│       ├── analytics/
│       └── settings/
├── components/
│   ├── ui/                     # Primitives: Button, Input, Badge, Modal
│   ├── layout/                 # Sidebar, Topbar, MobileNav
│   └── shared/                 # EmptyState, LoadingSpinner, ErrorCard
├── lib/
│   ├── api/
│   │   ├── client.ts           # openapi-fetch base client + auth interceptor
│   │   ├── server-client.ts    # Server Component API client
│   │   └── <domain>.ts         # One file per domain
│   └── auth/
│       ├── client.ts           # Browser Supabase client
│       └── server.ts           # Server Supabase client
├── types/
│   └── api/                    # Auto-generated — pnpm openapi-ts
└── middleware.ts
```

---

## Priority Rules

| Priority | Rule |
|----------|------|
| 1 | Server Components default — `"use client"` only for state/events/effects |
| 2 | Types always from `pnpm openapi-ts` — never hand-written |
| 3 | All fetches through `lib/api/<domain>.ts` — never inline fetch in components |
| 4 | Auth JWT attached via `client.ts` interceptor on every request |
| 5 | Loading + empty + error states required on every data-fetching component |
| 6 | `react-hook-form` + `zod` for all forms |
| 7 | Tailwind only — no CSS modules, no inline styles |
| 8 | `router.refresh()` after every mutation |

---

## 1. API Client Base (`frontend/lib/api/client.ts`)

```typescript
import createClient from '@hey-api/client-fetch';
import { createBrowserClient } from '@supabase/ssr';

export const client = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

client.interceptors.request.use(async (request) => {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    request.headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  return request;
});
```

### Server-side (`frontend/lib/api/server-client.ts`)

```typescript
import createClient from '@hey-api/client-fetch';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getServerApiClient() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { session } } = await supabase.auth.getSession();
  const api = createClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL! });
  if (session?.access_token) {
    api.interceptors.request.use((req) => {
      req.headers.set('Authorization', `Bearer ${session.access_token}`);
      return req;
    });
  }
  return api;
}
```

---

## 2. Domain API Client (`frontend/lib/api/<domain>.ts`)

```typescript
// frontend/lib/api/contacts.ts
import { client } from './client';
import type { ContactResponse, ContactListResponse, ContactCreateRequest, ContactUpdateRequest } from '@/types/api';

export async function getContacts(params?: { page?: number; page_size?: number; search?: string }): Promise<ContactListResponse> {
  const { data, error } = await client.GET('/api/contacts', { params: { query: params } });
  if (error) throw new Error((error as any).detail ?? 'Failed to fetch contacts');
  return data!;
}

export async function createContact(body: ContactCreateRequest): Promise<ContactResponse> {
  const { data, error } = await client.POST('/api/contacts', { body });
  if (error) throw new Error((error as any).detail ?? 'Failed to create contact');
  return data!;
}

export async function updateContact(id: string, body: ContactUpdateRequest): Promise<ContactResponse> {
  const { data, error } = await client.PATCH('/api/contacts/{contact_id}', {
    params: { path: { contact_id: id } },
    body,
  });
  if (error) throw new Error((error as any).detail ?? 'Failed to update contact');
  return data!;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await client.DELETE('/api/contacts/{contact_id}', {
    params: { path: { contact_id: id } },
  });
  if (error) throw new Error((error as any).detail ?? 'Failed to delete contact');
}
```

---

## 3. Middleware (`frontend/middleware.ts`)

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};
```

---

## 4. Dashboard Layout (`frontend/app/dashboard/layout.tsx`)

```typescript
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

---

## 5. Server Component (List Page)

```typescript
// frontend/app/dashboard/business/contacts/page.tsx
import { getServerApiClient } from '@/lib/api/server-client';
import { ContactsTable } from '@/components/business/ContactsTable';
import { CreateContactButton } from '@/components/business/CreateContactButton';

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const api = await getServerApiClient();

  const { data: contacts, error } = await api.GET('/api/contacts', {
    params: { query: { page: params.page ? parseInt(params.page) : 1, page_size: 50, search: params.search } },
  });

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">Failed to load contacts. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">{contacts!.total} total</p>
        </div>
        <CreateContactButton />
      </div>

      {contacts!.items.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-16 text-center">
          <p className="text-sm font-medium text-gray-900">No contacts yet</p>
          <p className="mt-1 text-sm text-gray-500">Import a CSV or add manually.</p>
        </div>
      ) : (
        <ContactsTable contacts={contacts!.items} total={contacts!.total} />
      )}
    </div>
  );
}
```

---

## 6. Client Component (Form)

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { createContact } from '@/lib/api/contacts';

const schema = z.object({
  name: z.string().min(1, 'Required').max(255),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Must be E.164 (e.g. +263771234567)'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

export function CreateContactForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      await createContact({ ...data, email: data.email || undefined });
      router.refresh();
      onSuccess();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Failed to create contact');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{serverError}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          {...register('name')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Phone <span className="text-red-500">*</span>
        </label>
        <input
          {...register('phone')}
          placeholder="+263771234567"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting}
          className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {isSubmitting ? 'Creating…' : 'Create Contact'}
        </button>
      </div>
    </form>
  );
}
```

---

## 7. Shared Primitives

```typescript
// components/shared/EmptyState.tsx
export function EmptyState({ title, description, action }: {
  title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-200 p-16 text-center">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// components/shared/LoadingSpinner.tsx
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }[size];
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${s} animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600`} />
    </div>
  );
}

// components/shared/Badge.tsx
const variants = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
} as const;

export function Badge({ children, variant = 'default' }: {
  children: React.ReactNode; variant?: keyof typeof variants;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}
```

---

## 8. TypeScript Type Generation

```typescript
// frontend/openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  client: '@hey-api/client-fetch',
  input: process.env.OPENAPI_URL ?? 'http://localhost:8000/openapi.json',
  output: { path: 'types/api', format: 'prettier' },
  services: false,
});
```

```bash
# Run after ANY FastAPI model change — before writing frontend code
cd frontend && pnpm openapi-ts
```

---

## Pre-Delivery Checklist

- [ ] `pnpm openapi-ts` run — no hand-written API types
- [ ] All API calls through `lib/api/<domain>.ts` — no inline fetch
- [ ] Server Component for data fetching — no `useEffect` for initial load
- [ ] `"use client"` only where state/effects/events needed
- [ ] Loading, empty, and error states all handled
- [ ] Form uses `react-hook-form` + `zod` with per-field error messages
- [ ] `router.refresh()` after every mutation
- [ ] No `any` TypeScript types
- [ ] No hardcoded data
- [ ] Mobile layout works at 375px
- [ ] No secrets in `NEXT_PUBLIC_` env vars
