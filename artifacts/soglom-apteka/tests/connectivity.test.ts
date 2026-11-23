import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getConnectivity,
  reportConnectivity,
  subscribeConnectivity,
} from '../lib/connectivity';

const root = join(__dirname, '..');

describe('connectivity bus', () => {
  it('notifies subscribers on change and ignores duplicates', () => {
    reportConnectivity(true);
    const seen: boolean[] = [];
    const unsub = subscribeConnectivity((v) => seen.push(v));
    assert.deepEqual(seen, [true]);
    reportConnectivity(false);
    reportConnectivity(false);
    reportConnectivity(true);
    assert.deepEqual(seen, [true, false, true]);
    assert.equal(getConnectivity(), true);
    unsub();
    reportConnectivity(true);
  });
});

describe('offline banner wiring', () => {
  it('root layout mounts OfflineBanner', () => {
    const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
    assert.match(layout, /OfflineBanner/);
    assert.match(layout, /testID="offline-banner"|from '@\/components\/OfflineBanner'/);
  });

  it('api reports connectivity on fetch success/failure', () => {
    const api = readFileSync(join(root, 'lib/api.ts'), 'utf8');
    assert.match(api, /reportConnectivity\(true\)/);
    assert.match(api, /reportConnectivity\(false\)/);
  });
});
