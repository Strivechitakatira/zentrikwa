'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessageCircle,
  MessagesSquare,
  Users,
  Megaphone,
  BarChart3,
  Settings,
  LogOut,
  Sun,
  Moon,
  Zap,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';

const NAV = [
  { label: 'Dashboard',     href: '/dashboard',               icon: LayoutDashboard },
  { label: 'WhatsApp',      href: '/dashboard/whatsapp',      icon: MessageCircle },
  { label: 'Conversations', href: '/dashboard/conversations',  icon: MessagesSquare },
  { label: 'Contacts',      href: '/dashboard/contacts',       icon: Users },
  { label: 'Campaigns',     href: '/dashboard/campaigns',      icon: Megaphone },
  { label: 'Analytics',     href: '/dashboard/analytics',      icon: BarChart3 },
  { label: 'Settings',      href: '/dashboard/settings',       icon: Settings },
];

interface SidebarProps {
  userEmail: string;
  userName?: string;
}

export default function Sidebar({ userEmail, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (userEmail[0] ?? 'U').toUpperCase();

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-semibold tracking-tight text-white">Conva</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV.map(({ label, href, icon: Icon }) => {
          const isActive = href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-100 ${
                isActive
                  ? 'bg-accent text-white'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
              }`}
            >
              <Icon
                className={`h-4 w-4 flex-shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-sidebar-text group-hover:text-white'
                }`}
              />
              {label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-3 space-y-1">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white"
          aria-label="Toggle theme"
        >
          {mounted && theme === 'dark' ? (
            <Sun className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Moon className="h-4 w-4 flex-shrink-0" />
          )}
          {mounted ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : 'Toggle theme'}
        </button>

        {/* User */}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent-text">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            {userName && (
              <p className="truncate text-xs font-medium text-white">{userName}</p>
            )}
            <p className="truncate text-xs text-sidebar-text">{userEmail}</p>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
