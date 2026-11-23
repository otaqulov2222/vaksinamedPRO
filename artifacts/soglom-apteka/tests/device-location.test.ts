import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Device location hardening', () => {
  it('web path uses browser Geolocation and separates denied vs unavailable', () => {
    const src = read('lib/deviceLocation.ts');
    assert.match(src, /navigator\.geolocation/);
    assert.match(src, /PERMISSION_DENIED|error === 'denied'|error: 'denied'/);
    assert.match(src, /unavailable/);
    assert.match(src, /timeout/);
    assert.match(src, /Never conflate|never conflate|Permission may be granted/i);
    assert.match(src, /enableHighAccuracy:\s*true/);
  });

  it('branches screen uses getDeviceLocation and map pick-origin fallback', () => {
    const src = read('app/branches.tsx');
    assert.match(src, /getDeviceLocation/);
    assert.match(src, /pickOriginActive/);
    assert.match(src, /onPickOrigin/);
    assert.doesNotMatch(src, /expo-location/);
    assert.doesNotMatch(src, /openYandexRoute/);
  });

  it('i18n includes unavailable and timeout copy in uz/ru/en (branch GPS / maps)', () => {
    const branches = read('lib/i18n/messages/branches.ts');
    const cart = read('lib/i18n/messages/cart.ts');
    const blob = `${branches}\n${cart}`;
    assert.match(blob, /unavailable|Unavailable|mavjud emas|недоступ/i);
    assert.match(blob, /timeout|Timeout|vaqt|тайм/i);
  });
});

