/**
 * Balance table from spec §3, keyed by ROLE-HOLDER count (players excluding the
 * Moderator, who holds no Town/Outlaw slot). Detective and Doctor are always 1;
 * everyone else after the Outlaws is vanilla Town.
 */
const OUTLAWS_BY_HOLDERS: Record<number, number> = {
  3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 2, 9: 2, 10: 2, 11: 3, 12: 3, 13: 3, 14: 4, 15: 4, 16: 4,
};

export const MIN_ROLE_HOLDERS = 3;
export const MAX_ROLE_HOLDERS = 16;

export function outlawCountFor(roleHolders: number): number | null {
  const fromTable = OUTLAWS_BY_HOLDERS[roleHolders];
  return fromTable !== undefined ? fromTable : null;
}
