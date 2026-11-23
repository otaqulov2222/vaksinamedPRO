import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  birthDateToDisplay,
  formatBirthDateInput,
  parseBirthDate,
} from '../lib/birthDate';

describe('birthDate parse / format', () => {
  it('accepts dots, slashes, underscores, dashes, and digit-only', () => {
    assert.equal(parseBirthDate('2004.05.07'), '2004-05-07');
    assert.equal(parseBirthDate('2004/05/07'), '2004-05-07');
    assert.equal(parseBirthDate('2004_05_07'), '2004-05-07');
    assert.equal(parseBirthDate('2004-05-07'), '2004-05-07');
    assert.equal(parseBirthDate('20040507'), '2004-05-07');
  });

  it('rejects invalid calendar dates', () => {
    assert.equal(parseBirthDate('2004.13.01'), null);
    assert.equal(parseBirthDate('2004.02.30'), null);
    assert.equal(parseBirthDate('1899.01.01'), null);
    assert.equal(parseBirthDate('abc'), null);
  });

  it('masks progressive digit input as YYYY.MM.DD', () => {
    assert.equal(formatBirthDateInput('2004'), '2004');
    assert.equal(formatBirthDateInput('200405'), '2004.05');
    assert.equal(formatBirthDateInput('20040507'), '2004.05.07');
    assert.equal(formatBirthDateInput('2004/05/07'), '2004.05.07');
  });

  it('converts ISO to dotted display', () => {
    assert.equal(birthDateToDisplay('2004-05-07'), '2004.05.07');
  });
});
