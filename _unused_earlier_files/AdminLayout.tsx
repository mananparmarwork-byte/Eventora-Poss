import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, CalendarDays, ChevronsLeft, ChevronsRight, FileText, LayoutDashboard, LogOut, Menu, PackageOpen, Plus, Settings, BarChart3, X, FlaskConical } from 'lucide-react';
import { LogoMark } from './Logo';
import { Button, cx, useUi } from './ui';
import { useAuth, useBusiness } from '@/lib/api';
import { backend } from '@/lib/backend';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/quotes', label: 'Quotations', icon: FileText },
  { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/admin/catalog', label: 'Catalog', icon: PackageOpen },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];
const TITLES: [string, string][] = [
  ['/admin/new', 'New quotation'], ['/admin/edit', 'Edit quotation'], ['/admin/quotes', 'Quotations'], ['/admin/calendar', 'Calendar'],
  ['/admin/catalog', 'Catalog'], ['/admin/reports', 'Reports'], ['/admin/settings', 'Settings'], ['/admin', 'Overview'],
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [path, navigate] = useLocation();
  const { session } = useAuth();
  const business = useBusiness();
  const { toast } = useUi();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('eventora.sidebar') === '1'; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem('eventora.sidebar', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => setMobileOpen(false), [path]);
  const title = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? 'Eventora OS';
  const isActive = (n: (typeof NAV)[number]) => (n.exact ? path === n.href : path.startsWith(n.href));
  const initials = (session?.email ?? 'A').slice(0, 2).toUpperCase();

  const signOut = async () => { try { await backend.signOut(); navigate('/admin'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not sign out.', 'error'); } };

  const SidebarBody = ({ compact }: { compact: boolean }) => (
    <>
      <div className={cx('flex h-[72px] items-center border-b border-border', compact ? 'justify-center' : 'gap-3 px-5')}>
        <LogoMark size={38} />
        {!compact && <div className="min-w-0"><p className="font-display text-lg font-semibold leading-tight">Eventora <span className="text-gold">OS</span></p><p className="truncate text-[11px] text-text-secondary">{business.data?.name ?? 'Venue operations'}</p></div>}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
        {NAV.map((n) => {
          const active = isActive(n); const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} title={compact ? n.label : undefined}
              className={cx('group relative flex h-11 items-center gap-3 rounded-xl text-sm font-medium transition-colors', compact ? 'justify-center' : 'px-3.5',
                active ? 'bg-surface text-gold' : 'text-text-secondary hover:bg-surface/60 hover:text-text')}>
              {active && <span className="absolute left-0 top-2.5 h-6 w-[3px] rounded-r bg-gold" />}
              <Icon size={19} />{!compact && n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className={cx('flex items-center gap-3 rounded-xl p-2', compact && 'justify-center')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold">{initials}</span>
          {!compact && <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{session?.email}</p><p className="text-[11px] text-text-disabled">Administrator</p></div>}
          {!compact && <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-2 text-text-secondary hover:bg-surface hover:text-error"><LogOut size={16} /></button>}
        </div>
        {compact && <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="mt-1 flex h-9 w-full items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-error"><LogOut size={16} /></button>}
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-page">
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar transition-[width] duration-200 lg:flex', collapsed ? 'w-[76px]' : 'w-[248px]')}>
        <SidebarBody compact={collapsed} />
        <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-[60px] grid size-6 place-items-center rounded-full border border-border bg-surface text-text-secondary hover:text-gold">
          {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setMobileOpen(false); }}>
          <div className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="fade-up absolute inset-y-0 left-0 flex w-[272px] flex-col border-r border-border bg-sidebar">
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute right-3 top-5 rounded-lg p-1.5 text-text-secondary hover:bg-surface"><X size={18} /></button>
            <SidebarBody compact={false} />
          </aside>
        </div>
      )}

      <div className={cx('transition-[padding] duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 border-b border-border bg-page/85 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" className="grid size-10 place-items-center rounded-xl border border-border lg:hidden"><Menu size={18} /></button>
            <div className="min-w-0"><h1 className="truncate text-lg font-semibold">{title}</h1><p className="hidden text-xs text-text-secondary sm:block">{business.data?.name ?? 'Eventora OS'} · Workspace</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="gold" icon={<Plus size={16} />} onClick={() => navigate('/admin/new')}><span className="hidden sm:inline">New quotation</span><span className="sm:hidden">New</span></Button>
            <button type="button" aria-label="Notifications" className="hidden size-10 place-items-center rounded-xl border border-border text-text-secondary hover:text-text sm:grid"><Bell size={17} /></button>
          </div>
        </header>
        {backend.mode === 'demo' && (
          <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-2 text-xs text-warning sm:px-8" role="note">
            <FlaskConical size={14} className="shrink-0" />Demo mode: sample data stored in this browser only. Add your Supabase keys in <code className="rounded bg-obsidian/40 px-1">.env</code> to go live.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
