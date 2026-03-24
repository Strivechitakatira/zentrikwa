import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Conva',
    template: '%s | Conva',
  },
  description: 'WhatsApp Business AI — powered by Conva',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 antialiased">{children}</body>
    </html>
  );
}
