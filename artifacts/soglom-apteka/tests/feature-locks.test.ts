/**
 * FEATURE LOCKS — do not delete or “quietly hide” these customer surfaces.
 *
 * Pickup branch lives under Manzillarim (not a separate profile row).
 * Changing this inventory requires an explicit product decision + test update.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const PROFILE_REQUIRED_TEST_IDS = [
  'profile-cashback',
  'profile-orders',
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
  it('locks profile menu: Dorixonalar + Manzillarim (selected branch only inside Manzillarim)', () => {
    const profile = read('app/(tabs)/profile.tsx');
    for (const id of PROFILE_REQUIRED_TEST_IDS) {
      assert.equal(
        (profile.match(new RegExp(`testID="${id}"`, 'g')) ?? []).length,
        1,
        `Missing locked profile entry: ${id}`,
      );
    }
    assert.doesNotMatch(profile, /testID="profile-selected-branch"/);
    assert.match(profile, /common\.navAddresses/);
    assert.match(profile, /router\.push\('\/addresses'\)/);
    assert.match(profile, /router\.push\('\/branches'\)/);
    assert.match(profile, /selectedBranch\?\.name/);
    assert.match(profile, /api\.cart\(/);
  });

  it('locks Manzillarim screen to show selected pickup branch', () => {
    const addresses = read('app/addresses.tsx');
    const layout = read('app/_layout.tsx');
    assert.match(layout, /name="addresses"/);
    assert.match(addresses, /profile\.selectedBranchTitle/);
    assert.match(addresses, /addresses-selected-branch-cta/);
    assert.match(addresses, /api\.cart\(/);
    assert.match(addresses, /pathname:\s*'\/branches'/);
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

  it('locks i18n keys for Manzillarim / selected branch in uz/ru/en', () => {
    const profileI18n = read('lib/i18n/messages/profile.ts');
    for (const key of [
      'selectedBranchTitle',
      'selectedBranchNone',
      'selectedBranchA11y',
      'selectedBranchPickA11y',
      'addressesTitle',
      'addressesDisabledTitle',
      'addressesDisabledBody',
    ]) {
      const hits = profileI18n.match(new RegExp(`${key}:`, 'g')) ?? [];
      assert.equal(hits.length, 3, `${key} must exist in uz/ru/en`);
    }
  });
});
