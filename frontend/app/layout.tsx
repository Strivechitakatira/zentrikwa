import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: {
    default: 'Conva',
    template: '%s | Conva',
  },
  description: 'WhatsApp Business AI — powered by Conva',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
