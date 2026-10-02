import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Static audit of the mobile source for user-facing copy that bypasses i18n.
 * Lines carrying an `i18n-ignore` comment (API payload values, endonyms) are exempt.
 */

const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'context', 'hooks', 'constants', 'lib'];
const EXCLUDE = [`lib${sep}i18n${sep}`];

type Finding = { file: string; line: number; kind: string; text: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function sourceFiles(): string[] {
  return SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).filter((f) => !EXCLUDE.some((ex) => relative(ROOT, f).startsWith(ex)));
}

/** Replaces comments with spaces (keeps offsets/newlines) while leaving string literals intact. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length;

const UI_PROPS =
  'placeholder|title|accessibilityLabel|accessibilityHint|label|subtitle|headerTitle|headerBackTitle|tabBarLabel|confirmText|cancelText|message|hint|description|cta|emptyText';
const PROP_LITERAL = new RegExp(`\\b(${UI_PROPS})\\s*[=:]\\s*(['"\`])([^'"\`\\n]*)\\2`, 'g');
const DIALOG_LITERAL = /\b(Alert\.alert|notify|confirmAction|window\.alert|window\.confirm)\(\s*(['"`])/g;
/** Text after an opening/closing JSX tag, up to the next tag or expression. */
const JSX_TEXT = /(?<=<[A-Za-z][\w.]*(?:\s[^<>]*)?>|<\/[\w.]+>)([^<>{}]+)(?=[<{])/g;
const CYRILLIC = /[А-Яа-яЁё]/;
const UZ_APOSTROPHE_LITERAL = /(['"`])[^'"`\n]*[‘’ʻʼ][^'"`\n]*\1/g;
/** Multi-word or capitalized word literals ("Tez xizmat", 'Xatolik') anywhere in code, not only in props. */
const WORDY_LITERAL = /(?<![\w.])(['`])([A-Za-z][a-z‘’]+(?: [A-Za-z‘’][a-z‘’]*)+[.!?…]?|[A-Z][a-z‘’]{2,}[.!?…]?)\1/g;
const LANGUAGE_CONDITION = /\blanguage\s*[!=]==?\s*['"](uz|ru|en)['"]|['"](uz|ru|en)['"]\s*[!=]==?\s*language\b/g;
const LEGACY_FORMAT = /\b(formatUzs|Intl\.NumberFormat|toLocaleDateString|toLocaleTimeString|toLocaleString)\b/g;

function looksLikeCopy(text: string): boolean {
  const s = text.trim();
  if (!/[A-Za-zА-Яа-яЁё]/.test(s)) return false;
  if (/^[a-z0-9_.\-/:#@]+$/i.test(s) && !/\s/.test(s) && !/^[A-Z][a-z]/.test(s)) return false; // identifiers, routes, enum values
  if (/^(Inter_\w+|https?:\/\/\S+|\+998|VAKSINA MED|Vaksina Med|OK|QR|Rx|24\/7)$/.test(s)) return false;
  return true;
}

function scan(): Record<string, Finding[]> {
  const findings: Record<string, Finding[]> = {
    hardcoded: [],
    languageConditioned: [],
    alertOutsideDialogs: [],
    legacyFormatting: [],
  };
  for (const file of sourceFiles()) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const rawLines = raw.split('\n');
    const code = stripComments(raw);
    const ignored = (line: number) => /i18n-ignore/.test(rawLines[line - 1] ?? '');
    const add = (kind: keyof typeof findings, index: number, text: string) => {
      const line = lineOf(code, index);
      if (ignored(line)) return;
      findings[kind].push({ file: rel, line, kind, text: text.trim().slice(0, 90) });
    };

    code.split('\n').forEach((lineText, idx) => {
      if (CYRILLIC.test(lineText) && !/i18n-ignore/.test(rawLines[idx])) {
        findings.hardcoded.push({ file: rel, line: idx + 1, kind: 'cyrillic', text: lineText.trim().slice(0, 90) });
      }
    });
    for (const m of code.matchAll(UZ_APOSTROPHE_LITERAL)) add('hardcoded', m.index!, m[0]);
    for (const m of code.matchAll(PROP_LITERAL)) if (looksLikeCopy(m[3])) add('hardcoded', m.index!, m[0]);
    for (const m of code.matchAll(DIALOG_LITERAL)) add('hardcoded', m.index!, m[0]);
    for (const m of code.matchAll(WORDY_LITERAL)) {
      const before = code.slice(Math.max(0, m.index! - 40), m.index!);
      if (/(fontFamily|accessibilityRole|from|require\(|import\()\s*:?\s*$/.test(before)) continue;
      if (/^(Inter_\w+|Payme|Click)$/.test(m[2])) continue;
      add('hardcoded', m.index!, m[0]);
    }
    if (file.endsWith('.tsx')) {
      for (const m of code.matchAll(JSX_TEXT)) {
        const text = m[1];
        const trimmed = text.trim();
        if (!/^[A-Za-zА-Яа-яЁё0-9‘’]/.test(trimmed)) continue;
        if (/[=;()&|?[\]'"`]|=>|\bconst\b|\breturn\b|^\w+:\s|\n\s*\w+:\s/.test(text)) continue; // TS generics / expressions
        if (looksLikeCopy(text) && /[A-Za-zА-Яа-яЁё]{2,}/.test(text)) add('hardcoded', m.index!, text);
      }
    }
    for (const m of code.matchAll(LANGUAGE_CONDITION)) add('languageConditioned', m.index!, m[0]);
    for (const m of code.matchAll(LEGACY_FORMAT)) add('legacyFormatting', m.index!, m[0]);
    if (rel !== 'lib/dialogs.ts') for (const m of code.matchAll(/\bAlert\.alert\(/g)) add('alertOutsideDialogs', m.index!, m[0]);
  }
  for (const list of Object.values(findings)) {
    const seen = new Set<string>();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const id = `${list[i].file}:${list[i].line}:${list[i].text}`;
      if (seen.has(id)) list.splice(i, 1);
      else seen.add(id);
    }
  }
  return findings;
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('mobile source i18n audit', () => {
  const findings = scan();
  const show = (list: Finding[]) => list.map((f) => `${f.file}:${f.line} [${f.kind}] ${f.text}`).join('\n');

  it('USER-FACING HARDCODED STRINGS FOUND: 0', () => {
    console.log(`USER-FACING HARDCODED STRINGS FOUND: ${findings.hardcoded.length}`);
    assert.equal(findings.hardcoded.length, 0, show(findings.hardcoded));
  });

  it('LANGUAGE-CONDITIONED STRINGS OUTSIDE I18N: 0', () => {
    console.log(`LANGUAGE-CONDITIONED STRINGS OUTSIDE I18N: ${findings.languageConditioned.length}`);
    assert.equal(findings.languageConditioned.length, 0, show(findings.languageConditioned));
  });

  it('no Alert.alert outside lib/dialogs (no-op on react-native-web)', () => {
    assert.equal(findings.alertOutsideDialogs.length, 0, show(findings.alertOutsideDialogs));
  });

  it('no locale-dependent formatting outside lib/i18n/format', () => {
    assert.equal(findings.legacyFormatting.length, 0, show(findings.legacyFormatting));
  });

  it('the scanner itself detects violations', () => {
    const sample = stripComments(`// 'Chiqish' in a comment is fine\n<Text>Bosh sahifa</Text>\nplaceholder="Telefon raqam"\n`);
    assert.ok([...sample.matchAll(JSX_TEXT)].some((m) => looksLikeCopy(m[1])));
    assert.ok([...sample.matchAll(PROP_LITERAL)].some((m) => looksLikeCopy(m[3])));
    assert.ok(!/Chiqish/.test(sample.split('\n')[0]));
  });
});

describe('auth logout paths', () => {
  it('AUTH LOGOUT PATHS: verified', () => {
    const profile = read('app/(tabs)/profile.tsx');
    const ctx = read('context/AppContext.tsx');
    const api = read('lib/api.ts');
    const layout = read('app/_layout.tsx');

    // Profile button -> cross-platform confirm -> context logout -> navigation reset to welcome.
    assert.match(profile, /confirmAction\(/);
    assert.match(profile, /await logout\(\)/);
    assert.match(profile, /router\.replace\('\/welcome'\)/);
    assert.doesNotMatch(profile, /Alert\.alert/);

    // Context logout uses the pure teardown with the real backend endpoint.
    assert.match(ctx, /performLogout\(/);
    assert.match(ctx, /revoke: \(\) => api\.revokeSession\(\)/);
    assert.match(ctx, /markSessionEnded: \(\) => setSessionEnded\(true\)/);
    assert.match(ctx, /sessionEpochRef\.current \+= 1/);
    assert.match(api, /revokeSession: \(\) => request<[^>]+>\('\/api\/auth\/logout', \{ method: 'POST' \}\)/);
    assert.doesNotMatch(api, /logout: async/);

    // Telegram header identity is suppressed after logout; a new token re-enables it.
    assert.match(api, /if \(await isSessionEnded\(\)\) return ''/);
    assert.match(api, /await setSessionEnded\(false\)/);

    // Protected routes redirect to welcome and are covered while unauthenticated.
    assert.match(layout, /router\.replace\('\/welcome'\)/);
    assert.match(layout, /const blocked = !isAuthenticated && !inAuthGroup/);

    // Only the context/api layer touches the token; no screen clears storage wholesale.
    for (const file of sourceFiles()) {
      const rel = relative(ROOT, file).split(sep).join('/');
      const src = readFileSync(file, 'utf8');
      assert.doesNotMatch(src, /AsyncStorage\.clear\(/, rel);
      if (!['lib/api.ts', 'context/AppContext.tsx'].includes(rel)) assert.doesNotMatch(src, /setAuthToken\(/, rel);
      assert.doesNotMatch(src, /console\.(log|warn|error|info)\([^)]*token/i, rel);
    }
    console.log('AUTH LOGOUT PATHS: verified');
  });
});

describe('profile screen entry points', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const count = (re: RegExp) => (profile.match(re) ?? []).length;

  it('language is reachable only from the header badge', () => {
    assert.equal(count(/router\.push\('\/language'\)/g), 1);
    assert.equal(count(/<LanguageBadge\b/g), 1);
    assert.match(profile, /<LanguageBadge language=\{language as Language\}[^>]*onPress=\{\(\) => router\.push\('\/language'\)\} \/>/);
    assert.doesNotMatch(profile, /title=\{t\('common\.navLanguage'\)\}/);
  });

  it('profile edit is reachable only from the identity link', () => {
    assert.equal(count(/router\.push\('\/edit-profile'\)/g), 1);
    assert.equal(count(/onPress=\{onEdit\}/g), 1);
    assert.equal(count(/testID="profile-edit"/g), 1);
    assert.equal(count(/accessibilityLabel=\{t\('common\.navEditProfile'\)\}/g), 1);
    assert.doesNotMatch(profile, /title=\{t\('common\.navEditProfile'\)\}/);
  });

  it('every destination has one route literal (cashback: shared handler + tier focus)', () => {
    const routes: Record<string, number> = {
      '/cashback': 2,
      '/(tabs)/purchases': 1,
      '/notifications': 1,
      '/help': 1,
      '/branches': 1,
      '/rating': 1,
      '/about': 1,
    };
    for (const [route, expected] of Object.entries(routes)) {
      assert.equal(profile.split(`'${route}'`).length - 1, expected, route);
    }
    assert.doesNotMatch(profile, /router\.push\('\/qr'\)|'\/\(tabs\)\/qr'/, 'QR stays in the tab bar only');
    for (const id of ['profile-cashback', 'profile-tier', 'profile-orders', 'profile-branches', 'profile-bell', 'profile-logout']) {
      assert.equal(count(new RegExp(`testID="${id}"`, 'g')), 1, id);
    }
    assert.equal(count(/onPress=\{onCashback\}/g), 1, 'cashback menu row');
    assert.equal(count(/onPress=\{onNotifications\}/g), 2, 'header bell + notifications row share one handler');
    assert.equal(count(/onPress=\{onTier\}/g), 1);
    assert.doesNotMatch(profile, /profile\.accountSection/);
  });

  it('profile is a personal menu in a fixed order', () => {
    const order = [
      'profile-cashback',
      'profile-orders',
      'profile-branches',
      'profile-notifications',
      'profile-help',
      'profile-rating',
      'profile-about',
      'profile-logout',
    ];
    const positions = order.map((id) => {
      assert.equal(count(new RegExp(`testID="${id}"`, 'g')), 1, id);
      return profile.indexOf(`testID="${id}"`);
    });
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'menu rows keep the agreed order');
    assert.ok(profile.indexOf('testID="profile-edit"') < positions[0], 'edit belongs to the identity block above the menu');
  });

  it('profile carries no dashboard: no activity history, statistics or decorative art', () => {
    assert.doesNotMatch(profile, /buildActivityRows|transactions|activityEmpty|profile-activity-all/);
    assert.doesNotMatch(profile, /summary\.purchases\}|summary\.balanceAmount|CashbackCardArt|PharmacyHeroArt/);
    assert.doesNotMatch(profile, /VM-\d|Chilonzor|\+350|2 500|1 500/, 'no sample transactions');
  });

  it('identity renders only real account data from the summary view-model', () => {
    assert.match(profile, /buildProfileSummary\(/);
    for (const field of ['displayName', 'phone', 'initial', 'balance']) {
      assert.match(profile, new RegExp(`\\{summary\\.${field}\\}`), field);
    }
    assert.match(profile, /t\('profile\.rateLine', \{ rate: summary\.rate \}\)/, 'rate');
    assert.match(profile, /t\('profile\.memberStatus', \{ tier: summary\.tier \}\)/, 'tier');
    assert.doesNotMatch(profile, /progress|streak|savings|points/i);
  });

  it('logout keeps the shared flow', () => {
    assert.equal(count(/const onLogout = async/g), 1);
    assert.match(profile, /onPress=\{\(\) => void onLogout\(\)\}/);
  });
});
