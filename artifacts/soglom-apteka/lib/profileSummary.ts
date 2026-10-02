export const EMPTY_VALUE = '—';

export function formatPhone(phone: string | null | undefined): string {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) {
    return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  }
  if (d.length === 9) {
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
  }
  return phone || EMPTY_VALUE;
}

/** Cashback rate of the customer's tier from `/cashback/rules` tiers; null when it cannot be matched. */
export function matchTierRate(tiers: unknown, userTier: string | null | undefined): string | null {
  const list = Array.isArray(tiers) ? tiers : [];
  const tier = String(userTier || '').toLowerCase();
  if (!tier) return null;
  const match = list.find((item: any) => {
    const label = String(item?.tier || '').toLowerCase();
    if (!label) return false;
    return label === tier || label.includes(tier) || tier.includes(label.replace(/\s+daraja$/, ''));
  });
  const rate = match?.rate != null ? String(match.rate).trim() : '';
  return rate || null;
}

export type ProfileSummaryInput = {
  ready: boolean;
  name?: string | null;
  phone?: string | null;
  tier?: string | null;
  purchases?: unknown;
  balance?: unknown;
  tierRate?: string | null;
};

export type ProfileSummary = {
  displayName: string;
  initial: string;
  phone: string;
  /** Full localized money string, e.g. for accessibility labels. */
  balance: string;
  /** Grouped amount without currency, for the oversized wallet figure. */
  balanceAmount: string;
  /** Currency unit; empty while the balance is unknown. */
  currency: string;
  hasTier: boolean;
  tier: string;
  rate: string;
  purchases: string;
};

export type ProfileFormat = {
  money: (amount: number) => string;
  number: (amount: number) => string;
  currency: string;
};

const wholeNonNegative = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

/** Display values for the Profile hero. Only real account data; unknown values render as EMPTY_VALUE. */
export function buildProfileSummary(input: ProfileSummaryInput, format: ProfileFormat): ProfileSummary {
  const name = String(input.name || '').trim();
  const tier = String(input.tier || '').trim();
  const rate = String(input.tierRate || '').trim();
  const amount = wholeNonNegative(input.balance);
  return {
    displayName: name || EMPTY_VALUE,
    initial: name ? name[0].toUpperCase() : EMPTY_VALUE,
    phone: formatPhone(input.phone),
    balance: input.ready ? format.money(amount) : EMPTY_VALUE,
    balanceAmount: input.ready ? format.number(amount) : EMPTY_VALUE,
    currency: input.ready ? format.currency : '',
    hasTier: Boolean(tier),
    tier: tier || EMPTY_VALUE,
    rate: input.ready && tier && rate ? rate : EMPTY_VALUE,
    purchases: input.ready ? String(wholeNonNegative(input.purchases)) : EMPTY_VALUE,
  };
}
