import { BadgeCheck, CircleDot, Wallet } from 'lucide-react';
import { Badge } from './ui';
import type { PaymentState } from '@/lib/pricing';
import type { QuoteStatus } from '@/lib/types';

export function PaymentBadge({ state }: { state: PaymentState }) {
  if (state === 'paid') return <Badge tone="success"><BadgeCheck size={12} /> Paid</Badge>;
  if (state === 'partial') return <Badge tone="warning"><Wallet size={12} /> Partial</Badge>;
  return <Badge tone="neutral"><CircleDot size={12} /> Unpaid</Badge>;
}

export function StatusBadge({ status }: { status: QuoteStatus }) {
  if (status === 'confirmed') return <Badge tone="success">Booked</Badge>;
  if (status === 'contacted') return <Badge tone="info">Contacted</Badge>;
  if (status === 'archived') return <Badge tone="neutral">Archived</Badge>;
  return <Badge tone="gold">Enquiry</Badge>;
}
