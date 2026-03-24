import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Conva',
    template: '%s | Conva',
  },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="mb-8 flex flex-col items-center">
        <span className="text-2xl font-bold tracking-tight text-gray-900">Conva</span>
        <span className="mt-1 text-sm text-gray-500">WhatsApp Business AI</span>
      </div>
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
