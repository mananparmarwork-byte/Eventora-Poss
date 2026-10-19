import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Download, FileClock, Search, Settings } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, Input, Select, Spinner } from '@/components/ui';
import { RangePicker } from '@/components/RangePicker';
import { ActivityList } from '@/components/ActivityList';
import { ACTIVITY_FILTERS, ACTION_META, actorLabel, matchesFilter, type ActivityFilter } from '@/lib/activity';
import { cn, fmtDateTime } from '@/lib/format';
import { inPeriod, loadRange, resolveRange, saveRange, type RangeState } from '@/lib/range';
import { earliestDate } from '@/lib/stats';
import { useActivityFeed } from '@/lib/useFeed';
import { saveBlob } from '@/pdf/generate';

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const PAGE = 100;

export function ActivityPage() {
  const { entries, quotes, retention, isLoading, error } = useActivityFeed(true);
  const [range, setRange] = useState<RangeState>(() => ({ ...loadRange('activity'), gran: 'auto' }));
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [actor, setActor] = useState('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);

  const r = useMemo(() => resolveRange(range, earliestDate(quotes)), [range, quotes]);
  const actors = useMemo(() => Array.from(new Set(entries.map(actorLabel))).sort(), [entries]);
  const existing = useMemo(() => new Set(quotes.map((q) => q.reference)), [quotes]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return entries.filter((a) => inPeriod(a.at, r) && matchesFilter(a, filter) && (actor === 'all' || actorLabel(a) === actor)
      && (!s || [a.title, a.detail, a.reference, a.data.txn ?? '', a.data.customer ?? ''].some((v) => v.toLowerCase().includes(s))));
  }, [entries, r, filter, actor, search]);

  const counts = useMemo(() => {
    const c = { bills: 0, payments: 0, removed: 0 };
    entries.filter((a) => inPeriod(a.at, r)).forEach((a) => { const g = ACTION_META[a.action]?.group; if (g === 'bills' || g === 'payments' || g === 'removed') c[g] += 1; });
    return c;
  }, [entries, r]);

  const csv = () => {
    const head = ['Date & time', 'Done by', 'What happened', 'Bill number', 'Details', 'Amount', 'Method', 'UPI / transaction ref', 'Changes'];
    const body = rows.map((a) => [fmtDateTime(a.at), actorLabel(a), a.title, a.reference, a.detail, a.data.amount ?? '', a.data.method ?? '', a.data.txn ?? '', (a.data.changes ?? []).map((c) => `${c.label}: ${c.from ?? ''} -> ${c.to ?? ''}`).join(' | ')]);
    saveBlob(new Blob([[head, ...body].map((x) => x.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), `eventora-activity-${r.from}_${r.to}.csv`);
  };

  if (isLoading) return <Spinner label="Loading activity" />;
  if (error) return <Card className="p-8 text-center text-sm text-error">Could not load activity: {error.message}. Run the latest supabase/setup.sql.</Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h2 className="font-display text-2xl font-semibold text-text">Activity</h2><p className="mt-1 text-sm text-text-secondary">Every bill, payment, edit and deletion — and who did it.</p></div>
        <div className="flex gap-3">
          <Link href="/admin/settings"><Button variant="outline"><Settings size={15} /> Auto-delete</Button></Link>
          <Button variant="gold" onClick={csv} disabled={rows.length === 0}><Download size={15} /> CSV</Button>
        </div>
      </div>

      <Card className="space-y-4 p-4">
        <RangePicker value={range} onChange={(v) => { setRange(v); saveRange('activity', v); setShown(PAGE); }} earliest={earliestDate(quotes)} grouping={false} />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => { setFilter(f.id); setShown(PAGE); }} className={cn('flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors', filter === f.id ? 'bg-gold text-text-on-gold' : 'bg-input text-text-secondary hover:text-text')}>
                {f.label}{f.id !== 'all' && <span className={cn('text-xs', filter === f.id ? 'text-text-on-gold/70' : 'text-text-disabled')}>{counts[f.id]}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={actor} onChange={(e) => { setActor(e.target.value); setShown(PAGE); }} className="h-10 w-52" aria-label="Filter by person"><option value="all">Everyone</option>{actors.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
            <div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-disabled" /><Input className="pl-10" placeholder="Bill no., customer, UPI ref" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} aria-label="Search activity" /></div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={r.label} subtitle={`${rows.length} event${rows.length === 1 ? '' : 's'}${retention > 0 ? ` · older than ${retention} days is deleted automatically` : ' · kept until you delete it'}`} />
        {rows.length === 0 ? <EmptyState icon={<FileClock />} title="No activity found" text="Try a longer period or clear the filters." /> : (
          <>
            <ActivityList items={rows.slice(0, shown)} existing={existing} />
            {rows.length > shown && <div className="border-t border-border/60 p-4 text-center"><Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</Button></div>}
          </>
        )}
      </Card>
    </div>
  );
}
