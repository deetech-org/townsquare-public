import {
  MIN_ROLE_HOLDERS,
  MAX_ROLE_HOLDERS,
  outlawCountFor,
} from '../src/engine/RoleTable';

describe('balance table (spec §3 & Phase 2)', () => {
  it('returns the table outlaw counts for 3-16 role-holders', () => {
    const expected: Record<number, number> = {
      3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 2, 9: 2, 10: 2, 11: 3, 12: 3, 13: 3, 14: 4, 15: 4, 16: 4,
    };
    for (const [holders, outlaws] of Object.entries(expected)) {
      expect(outlawCountFor(Number(holders))).toBe(outlaws);
    }
  });

  it('sets MIN_ROLE_HOLDERS = 3 and MAX_ROLE_HOLDERS = 16', () => {
    expect(MIN_ROLE_HOLDERS).toBe(3);
    expect(MAX_ROLE_HOLDERS).toBe(16);
  });

  it('rejects below the table minimum', () => {
    expect(outlawCountFor(2)).toBeNull();
    expect(outlawCountFor(1)).toBeNull();
    expect(outlawCountFor(0)).toBeNull();
  });

  it('rejects above the table maximum', () => {
    expect(outlawCountFor(17)).toBeNull();
    expect(outlawCountFor(20)).toBeNull();
  });
});
