/**
 * FEATURE LOCKS — do not delete or “quietly hide” these customer surfaces.
 *
 * If a business decision removes a capability (e.g. home delivery), keep an
 * honest entry point + copy; never silently drop the menu row.
 * Changing this inventory requires an explicit product decision + test update.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** Profile menu rows that must always stay reachable for customers. */
const PROFILE_REQUIRED_TEST_IDS = [
  'profile-cashback',
  'profile-orders',
  'profile-selected-branch',
  'profile-branches',
  'profile-addresses',
  'profile-notifications',
  'profile-devices',
  'profile-language',
  'profile-help',
  'profile-rating',
  'profile-about',
  'profile-delete-account',
  'profile-edit',
  'profile-bell',
  'profile-logout',
] as const;

describe('Customer feature locks (must not silently disappear)', () => {
  it('locks profile menu inventory + selected branch + addresses entry', () => {
    const profile = read('app/(tabs)/profile.tsx');
    for (const id of PROFILE_REQUIRED_TEST_IDS) {
      assert.equal(
        (profile.match(new RegExp(`testID="${id}"`, 'g')) ?? []).length,
        1,
        `Missing locked profile entry: ${id}`,
      );
    }
    assert.match(profile, /profile\.selectedBranchTitle/);
    assert.match(profile, /common\.navAddresses/);
    assert.match(profile, /router\.push\('\/addresses'\)/);
    assert.match(profile, /pathname:\s*'\/branches'/);
    assert.match(profile, /api\.cart\(/);
  });

  it('locks addresses screen as honest pickup notice (delivery off ≠ menu gone)', () => {
    const addresses = read('app/addresses.tsx');
    const layout = read('app/_layout.tsx');
    assert.match(layout, /name="addresses"/);
    assert.match(addresses, /addressesDisabledTitle/);
    assert.match(addresses, /addresses-disabled-branches/);
    assert.match(addresses, /router\.push\('\/branches'\)/);
    assert.doesNotMatch(addresses, /api\.getAddresses\(|api\.createAddress\(/);
  });

  it('locks Dorixonalar routing inside the app (no external Yandex leave)', () => {
    const branches = read('app/branches.tsx');
    assert.match(branches, /getDeviceLocation/);
    assert.match(branches, /fetchDrivingRoute/);
    assert.match(branches, /pickOriginActive/);
    assert.match(branches, /drawRoute/);
    assert.doesNotMatch(branches, /openYandexRoute|expo-location/);
    assert.doesNotMatch(branches, /yandex\.ru\/maps|window\.open\(/);
  });

  it('locks i18n keys for restored profile surfaces in uz/ru/en', () => {
    const profileI18n = read('lib/i18n/messages/profile.ts');
    for (const key of [
      'selectedBranchTitle',
      'selectedBranchNone',
      'selectedBranchA11y',
      'selectedBranchPickA11y',
      'addressesTitle',
      'addressesDesc',
      'addressesDisabledTitle',
      'addressesDisabledBody',
    ]) {
      const hits = profileI18n.match(new RegExp(`${key}:`, 'g')) ?? [];
      assert.equal(hits.length, 3, `${key} must exist in uz/ru/en`);
    }
  });
});
