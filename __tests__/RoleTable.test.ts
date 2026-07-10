import {
  DEV_MIN_ROLE_HOLDERS,
  MIN_ROLE_HOLDERS,
  effectiveMinRoleHolders,
  outlawCountFor,
} from '../src/engine/RoleTable';

// jest-expo sets __DEV__ = true, so the dev-override branch is live in tests;
// individual tests flip it to assert release behavior and restore it after.
const setDev = (value: boolean) => { (globalThis as Record<string, unknown>).__DEV__ = value; };

afterEach(() => setDev(true));

describe('balance table (spec §3)', () => {
  it('returns the table outlaw counts for 6-16 role-holders', () => {
    const expected: Record<number, number> = {
      6: 1, 7: 2, 8: 2, 9: 2, 10: 2, 11: 3, 12: 3, 13: 3, 14: 4, 15: 4, 16: 4,
    };
    for (const [holders, outlaws] of Object.entries(expected)) {
      expect(outlawCountFor(Number(holders))).toBe(outlaws);
    }
  });

  it('rejects above the table maximum in any build', () => {
    expect(outlawCountFor(17)).toBeNull();
  });
});

describe('dev minimum override', () => {
  it('dev builds allow 3-5 role-holders with exactly 1 outlaw', () => {
    expect(outlawCountFor(3)).toBe(1);
    expect(outlawCountFor(4)).toBe(1);
    expect(outlawCountFor(5)).toBe(1);
    expect(effectiveMinRoleHolders()).toBe(DEV_MIN_ROLE_HOLDERS);
  });

  it('dev builds still reject below the dev minimum', () => {
    expect(outlawCountFor(2)).toBeNull();
    expect(outlawCountFor(0)).toBeNull();
  });

  it('release builds keep the real minimum — no undersized rounds', () => {
    setDev(false);
    expect(outlawCountFor(3)).toBeNull();
    expect(outlawCountFor(5)).toBeNull();
    expect(outlawCountFor(6)).toBe(1); // table itself unaffected
    expect(effectiveMinRoleHolders()).toBe(MIN_ROLE_HOLDERS);
  });
});
