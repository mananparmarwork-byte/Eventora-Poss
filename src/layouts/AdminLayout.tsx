import { useEffect, useState, type ReactNode } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { BarChart3, CalendarDays, ChevronsLeft, ChevronsRight, FileText, Layers, LayoutDashboard, LogOut, Menu, Plus, Settings, X } from 'lucide-react';
import { Brand } from '@/components/Logo';
import { Button, Spinner, useUi } from '@/components/ui';
import { signOut, useSession } from '@/lib/api';
import { cn, initials } from '@/lib/format';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/quotes', label: 'Quotations', icon: FileText },
  { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/admin/catalog', label: 'Catalog', icon: Layers },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

const TITLES: [string, string][] = [
  ['/admin/new', 'New quotation'], ['/admin/edit', 'Edit quotation'], ['/admin/quotes', 'Quotations'], ['/admin/calendar', 'Calendar'],
  ['/admin/catalog', 'Catalog'], ['/admin/reports', 'Reports'], ['/admin/settings', 'Settings'], ['/admin', 'Overview'],
];

function readCollapsed() { try { return window.localStorage.getItem('eventora-sidebar') === '1'; } catch { return false; } }

export function AdminLayout({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const { toast } = useUi();

  useEffect(() => { setDrawer(false); window.scrollTo({ top: 0 }); }, [location]);
  const toggle = () => setCollapsed((c) => { try { window.localStorage.setItem('eventora-sidebar', c ? '0' : '1'); } catch { /* ignore */ } return !c; });

  if (loading) return <div className="min-h-dvh bg-page"><Spinner label="Checking your session" /></div>;
  if (!session) return <Redirect to="/login" />;

  const title = TITLES.find(([p]) => location.startsWith(p))?.[1] ?? 'Eventora OS';
  const isActive = (item: (typeof NAV)[number]) => (item.exact ? location === item.href : location.startsWith(item.href));

  const sidebar = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-[72px] items-center border-b border-border/60 px-5', compact && 'justify-center px-0')}><Brand collapsed={compact} /></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} title={compact ? item.label : undefined}
              className={cn('group relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors', compact && 'justify-center px-0',
                active ? 'bg-gold/12 text-gold' : 'text-text-secondary hover:bg-surface hover:text-text')}>
              {active && <span className="absolute left-0 top-2.5 h-6 w-[3px] rounded-r bg-gold" />}
              <Icon size={19} className="shrink-0" />
              {!compact && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/60 p-3">
        <div className={cn('flex items-center gap-3 rounded-xl p-2', compact && 'justify-center')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold">{initials(session.email.split('@')[0])}</span>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-text">{session.email}</p>
              <button type="button" onClick={async () => { await signOut(); toast('Signed out', 'info'); navigate('/login'); }} className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-gold"><LogOut size={12} /> Sign out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-page text-text">
      {/* desktop sidebar: 248px open, 76px collapsed */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden border-r border-border/60 bg-sidebar transition-[width] duration-200 lg:block', collapsed ? 'w-[76px]' : 'w-[248px]')}>{sidebar(collapsed)}</aside>
      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="fade-up absolute inset-y-0 left-0 w-[260px] border-r border-border bg-sidebar">
            <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute right-3 top-5 text-text-secondary"><X size={20} /></button>
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-border/60 bg-page/85 px-4 backdrop-blur-md sm:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="grid size-10 place-items-center rounded-xl text-text-secondary hover:bg-surface lg:hidden"><Menu size={20} /></button>
          <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggle} className="hidden size-10 place-items-center rounded-xl text-text-secondary hover:bg-surface hover:text-text lg:grid">
            {collapsed ? <ChevronsRight size={19} /> : <ChevronsLeft size={19} />}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-semibold text-text">{title}</h1>
          </div>
          <Link href="/admin/new"><Button variant="gold" size="md"><Plus size={16} /> <span className="hidden sm:inline">New booking</span></Button></Link>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
