import type { TFunction } from '@/lib/i18n';

/**
 * Localized mirror of the server's cashback history labels (sourceLabelFor / titleFor).
 * Built from entryType + sourceType so the server's Uzbek sourceLabel is not shown in RU/EN.
 */
export function cashbackSourceLabel(t: TFunction, sourceType?: string | null, entryType?: string | null): string {
  const st = String(sourceType || '').toUpperCase();
  const et = String(entryType || '').toUpperCase();
  if (st === 'SYSTEM') return t('status.cashbackSource_SYSTEM');
  if (st === 'POS') return et === 'REVERSAL' ? t('status.cashbackSource_POS_REVERSAL') : t('status.cashbackSource_POS');
  if (st === 'ORDER') {
    return et === 'USE' || et === 'REVERSAL' ? t('status.cashbackSource_ORDER_ORDER') : t('status.cashbackSource_ORDER');
  }
  if (st === 'FOM_POS') return t('status.cashbackSource_FOM_POS');
  if (et === 'USE') return t('status.cashbackEntry_USE');
  if (et === 'REVERSAL') return t('status.cashbackEntry_REVERSAL');
  return t('status.cashbackSource_default');
}

/** Entry title by ledger kind ('earn' | 'use' | 'void') or entryType. */
export function cashbackEntryLabel(t: TFunction, kindOrEntryType?: string | null): string {
  switch (String(kindOrEntryType || '').toUpperCase()) {
    case 'USE':
      return t('status.cashbackEntry_USE');
    case 'VOID':
    case 'REVERSAL':
      return t('status.cashbackEntry_REVERSAL');
    case 'ADJUSTMENT':
      return t('status.cashbackEntry_ADJUSTMENT');
    default:
      return t('status.cashbackEntry_EARN');
  }
}
