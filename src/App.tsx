import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Redirect, Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { UiProvider, Button } from '@/components/ui';
import { AdminLayout } from '@/layouts/AdminLayout';
import { isBackendConfigured } from '@/lib/backend';
import { Estimator } from '@/pages/Estimator';
import { Login } from '@/pages/Login';
import { Overview } from '@/pages/admin/Overview';
import { Quotes } from '@/pages/admin/Quotes';
import { CalendarPage } from '@/pages/admin/CalendarPage';
import { CatalogPage } from '@/pages/admin/CatalogPage';
import { Reports } from '@/pages/admin/Reports';
import { SettingsPage } from '@/pages/admin/SettingsPage';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center bg-page p-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-text">Something went wrong</h1>
          <p className="mt-2 text-sm text-text-secondary">{this.state.error.message}</p>
          <Button variant="gold" className="mt-6" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>Reload Eventora OS</Button>
        </div>
      </main>
    );
  }
}

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-page p-6 text-center">
      <div>
        <p className="font-display text-6xl font-semibold text-gold">404</p>
        <p className="mt-2 text-text-secondary">That page does not exist.</p>
        <a href="#/" className="mt-6 inline-block text-sm text-gold hover:underline">Back to the estimator</a>
      </div>
    </main>
  );
}

function SetupRequired() {
  return (
    <main className="grid min-h-dvh place-items-center bg-page p-6">
      <div className="max-w-xl rounded-2xl border border-border bg-surface p-8">
        <h1 className="font-display text-2xl font-semibold text-text">Connect your database</h1>
        <p className="mt-2 text-sm text-text-secondary">Eventora OS needs a database before it can start. Add these two values and rebuild:</p>
        <ul className="mt-4 space-y-2 text-sm">
          <li><code className="rounded bg-input px-2 py-1 text-gold">VITE_SUPABASE_URL</code> — your Supabase Project URL</li>
          <li><code className="rounded bg-input px-2 py-1 text-gold">VITE_SUPABASE_ANON_KEY</code> — your Supabase anon public key</li>
        </ul>
        <p className="mt-4 text-sm text-text-secondary">On GitHub: Settings → Secrets and variables → Actions → <strong>Variables</strong>, then re-run the deploy. Locally: copy <code>.env.example</code> to <code>.env</code>. Full steps are in SETUP-GITHUB-SUPABASE.md.</p>
      </div>
    </main>
  );
}

export default function App() {
  if (!isBackendConfigured) return <SetupRequired />;
  return (
    <ErrorBoundary>
      <UiProvider>
        {/* Hash routing (#/admin) keeps every link working on GitHub Pages and on Hostinger without any server rewrite rules. */}
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/"><Estimator /></Route>
            <Route path="/login"><Login /></Route>
            <Route path="/admin"><AdminLayout><Overview /></AdminLayout></Route>
            <Route path="/admin/quotes"><AdminLayout><Quotes /></AdminLayout></Route>
            <Route path="/admin/quotes/:reference">{(p) => <AdminLayout><Quotes selected={decodeURIComponent(p.reference)} /></AdminLayout>}</Route>
            <Route path="/admin/new"><AdminLayout><Estimator embedded /></AdminLayout></Route>
            <Route path="/admin/edit/:reference">{(p) => <AdminLayout><Estimator embedded editRef={decodeURIComponent(p.reference)} /></AdminLayout>}</Route>
            <Route path="/admin/calendar"><AdminLayout><CalendarPage /></AdminLayout></Route>
            <Route path="/admin/catalog"><AdminLayout><CatalogPage /></AdminLayout></Route>
            <Route path="/admin/reports"><AdminLayout><Reports /></AdminLayout></Route>
            <Route path="/admin/settings"><AdminLayout><SettingsPage /></AdminLayout></Route>
            <Route path="/admin/:rest*"><Redirect to="/admin" /></Route>
            <Route><NotFound /></Route>
          </Switch>
        </Router>
      </UiProvider>
    </ErrorBoundary>
  );
}
