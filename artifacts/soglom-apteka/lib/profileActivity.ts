import { cashbackEntryLabel, cashbackSourceLabel } from '@/lib/cashbackLabels';
import type { TFunction } from '@/lib/i18n';
import type { DateFormatOptions } from '@/lib/i18n/format';

export type ActivityTone = 'earn' | 'use' | 'void';
export type ActivityChannel = 'store' | 'app' | 'other';

/** Subset of the cashback ledger entry (`AppContext` Transaction) the Profile feed reads. */
export type ActivityEntry = {
  id: string;
  kind?: string;
  cashback?: number;
  entryType?: string;
  sourceType?: string | null;
  sourceLabel?: string;
  branch?: string;
  branchName?: string | null;
  orderId?: number | null;
  orderCode?: string | null;
  receiptId?: string | null;
  createdAt?: string;
  date?: string;
};

export type ActivityRow = {
  id: string;
  tone: ActivityTone;
  channel: ActivityChannel;
  title: string;
  /** Branch, order or receipt reference — empty when the ledger has none. */
  detail: string;
  when: string;
  /** Signed localized money, e.g. "+350 so‘m". */
  amount: string;
  /** Shown under the amount when the title names a purchase rather than the cashback itself. */
  showCaption: boolean;
  orderId: number | null;
};

export type ActivityFormat = {
  money: (amount: number) => string;
  date: (input: string, options?: DateFormatOptions) => string;
};

export const PROFILE_ACTIVITY_LIMIT = 3;

function toneOf(kind?: string): ActivityTone {
  const k = String(kind || '').toLowerCase();
  if (k === 'use') return 'use';
  if (k === 'void') return 'void';
  return 'earn';
}

function channelOf(sourceType?: string | null): ActivityChannel {
  const st = String(sourceType || '').toUpperCase();
  if (st === 'POS' || st === 'FOM_POS') return 'store';
  if (st === 'ORDER') return 'app';
  return 'other';
}

function whenOf(raw: string | undefined, format: ActivityFormat, now: Date): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const hasTime = /T\d{2}:\d{2}/.test(raw);
  return format.date(raw, { withYear: d.getFullYear() !== now.getFullYear(), withTime: hasTime });
}

/** Newest ledger entries as Profile feed rows. Values come only from the ledger; nothing is synthesized. */
export function buildActivityRows(
  entries: readonly ActivityEntry[] | null | undefined,
  t: TFunction,
  format: ActivityFormat,
  options: { limit?: number; now?: Date } = {},
): ActivityRow[] {
  const list = Array.isArray(entries) ? entries : [];
  const limit = options.limit ?? PROFILE_ACTIVITY_LIMIT;
  const now = options.now ?? new Date();
  return list
    .filter((e) => e && String(e.id || '').trim())
    .slice(0, limit)
    .map((e) => {
      const tone = toneOf(e.kind);
      const raw = Number(e.cashback);
      const value = Number.isFinite(raw) ? raw : 0;
      const sign = tone === 'earn' ? '+' : tone === 'use' ? '−' : value > 0 ? '+' : value < 0 ? '−' : '';
      const entryType = e.entryType || (tone === 'use' ? 'USE' : tone === 'void' ? 'REVERSAL' : 'EARN');
      const hasSource = Boolean(e.sourceType || String(e.sourceLabel || '').trim());
      const sourceTitle = hasSource ? cashbackSourceLabel(t, e.sourceType, entryType) : '';
      const title = tone === 'use' ? cashbackEntryLabel(t, 'use') : sourceTitle || cashbackEntryLabel(t, tone);
      const branch = String(e.branchName || e.branch || '').trim();
      const detail = e.orderCode
        ? t('cashback.historyOrder', { code: e.orderCode })
        : branch || (e.receiptId ? t('cashback.historyReceipt', { id: e.receiptId }) : '');
      const orderId = e.orderId != null && Number.isFinite(Number(e.orderId)) && Number(e.orderId) > 0 ? Number(e.orderId) : null;
      return {
        id: String(e.id),
        tone,
        channel: channelOf(e.sourceType),
        title,
        detail,
        when: whenOf(e.createdAt || e.date, format, now),
        amount: `${sign}${format.money(Math.abs(value))}`,
        showCaption: tone !== 'use' && Boolean(sourceTitle),
        orderId,
      };
    });
}
