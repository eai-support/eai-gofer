import { describe, expect, it } from 'vitest';
import { compareReleaseVersions } from '../../../scripts/compare-release-versions.mjs';

describe('compareReleaseVersions', () => {
  it.each([
    ['3.12.4', '3.12.5', -1],
    ['3.12.5', '3.12.5', 0],
    ['3.13.0', '3.12.9', 1],
    ['4.0.0', '3.99.99', 1],
    ['3.12.5-rc.1', '3.12.5', -1],
    ['3.12.5-rc.2', '3.12.5-rc.10', -1],
    ['3.12.5+build.1', '3.12.5+build.2', 0],
  ])('compares %s with %s', (left, right, expected) => {
    expect(compareReleaseVersions(left, right)).toBe(expected);
  });

  it.each([
    'v3.12.5',
    '03.12.5',
    '3.12',
    '3.12.5-01',
    '3.12.5-rc.01',
    '3.12.5-rc..1',
    'not-a-version',
  ])('rejects invalid version %s', (value) => {
    expect(() => compareReleaseVersions(value, '3.12.5')).toThrow('Invalid release version');
  });

  it('is antisymmetric for every valid precedence comparison', () => {
    for (const [left, right] of [
      ['3.12.5-1', '3.12.5-alpha'],
      ['3.12.5-rc.2', '3.12.5-rc.10'],
      ['3.12.5-rc.1', '3.12.5'],
      ['3.12.5', '4.0.0-alpha'],
    ]) {
      expect(compareReleaseVersions(left, right)).toBe(-compareReleaseVersions(right, left));
    }
  });
});
