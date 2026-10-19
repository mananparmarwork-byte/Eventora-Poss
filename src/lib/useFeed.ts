import { useMemo } from 'react';
import { useActivity, useActivitySettings, useQuotes } from './api';
import { mergeActivity } from './activity';
import { dayOf } from './range';
import { todayISO } from './format';
import type { ActivityEntry } from './types';

/** Logged activity + older bills/payments, with the owner's auto-delete period applied. Owner only. */
export function useActivityFeed(enabled = true) {
  const { data: quotes = [] } = useQuotes();
  const act = useActivity(enabled);
  const { activitySettings } = useActivitySettings(enabled);
  const retention = activitySettings.retentionDays;
  const entries = useMemo<ActivityEntry[]>(() => {
    if (!enabled) return [];
    const all = mergeActivity(act.data ?? [], quotes);
    if (!(retention > 0)) return all;
    const cut = new Date(`${todayISO()}T00:00:00`); cut.setDate(cut.getDate() - retention);
    const from = dayOf(cut.toISOString());
    return all.filter((a) => dayOf(a.at) >= from);
  }, [act.data, quotes, retention, enabled]);
  return { entries, quotes, retention, isLoading: act.isLoading, error: act.error as Error | null };
}
