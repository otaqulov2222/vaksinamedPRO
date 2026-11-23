import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { branchRegionKey, branchRegionLabel, uniqueBranchRegionChips } from '../lib/branchRegions';

describe('branch region chips', () => {
  it('merges Andijon + Andijon viloyati into one chip', () => {
    const chips = uniqueBranchRegionChips(['Andijon', 'Andijon viloyati', "Farg'ona", "Farg'ona viloyati"]);
    assert.deepEqual(chips, ['Andijon', "Farg'ona"]);
  });

  it('keeps Toshkent shahar and Toshkent viloyati separate', () => {
    const chips = uniqueBranchRegionChips(['Toshkent shahri', 'Toshkent viloyati', 'Andijon viloyati']);
    assert.ok(chips.includes('Toshkent shahar'));
    assert.ok(chips.includes('Toshkent viloyati'));
    assert.ok(chips.includes('Andijon'));
    assert.equal(chips.filter((c) => c.toLowerCase().includes('toshkent')).length, 2);
  });

  it('keys match across aliases', () => {
    assert.equal(branchRegionKey('Andijon'), branchRegionKey('Andijon viloyati'));
    assert.equal(branchRegionKey('Toshkent shahri'), branchRegionKey('Toshkent shahar'));
    assert.notEqual(branchRegionKey('Toshkent shahri'), branchRegionKey('Toshkent viloyati'));
    assert.equal(branchRegionLabel('Toshkent shahri'), 'Toshkent shahar');
  });
});
