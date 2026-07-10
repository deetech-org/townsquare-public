/**
 * Balance table from spec §3, keyed by ROLE-HOLDER count (players excluding the
 * Moderator, who holds no Town/Outlaw slot). Detective and Doctor are always 1;
 * everyone else after the Outlaws is vanilla Town.
 */
const OUTLAWS_BY_HOLDERS: Record<number, number> = {
  6: 1, 7: 2, 8: 2, 9: 2, 10: 2, 11: 3, 12: 3, 13: 3, 14: 4, 15: 4, 16: 4,
};

export const MIN_ROLE_HOLDERS = 6;
export const MAX_ROLE_HOLDERS = 16;

/**
 * Dev builds allow a 3-holder round — exactly one Outlaw, Doctor, and Detective,
 * zero vanilla Town — so a complete round (night, sync, ballots, handoff) is
 * testable with two phones and one emulator instead of seven devices. Release
 * builds keep the real table minimum; `__DEV__` is compiled out of production.
 */
export const DEV_MIN_ROLE_HOLDERS = 3;

export function effectiveMinRoleHolders(): number {
  return __DEV__ ? DEV_MIN_ROLE_HOLDERS : MIN_ROLE_HOLDERS;
}

export function outlawCountFor(roleHolders: number): number | null {
  const fromTable = OUTLAWS_BY_HOLDERS[roleHolders];
  if (fromTable !== undefined) return fromTable;
  if (__DEV__ && roleHolders >= DEV_MIN_ROLE_HOLDERS && roleHolders < MIN_ROLE_HOLDERS) {
    return 1; // dev-only undersized round
  }
  return null;
}
