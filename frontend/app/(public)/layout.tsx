import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Conva', template: '%s | Conva' },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-4 py-12">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
            <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-txt-primary">Conva</span>
        </div>
        <span className="mt-2 text-sm text-txt-secondary">WhatsApp Business AI</span>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-card">
        {children}
      </div>
    </div>
  );
}
