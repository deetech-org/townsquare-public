import type { RotationTally, RotationCounts, TownsquareRole } from '../types';

type Bucket = keyof RotationCounts;

/** Among candidates, picks uniformly among whoever has the fewest past turns in `bucket`. */
function pickFair(candidates: string[], tally: RotationTally, bucket: Bucket): string {
  const counts = candidates.map(name => tally[name]?.[bucket] ?? 0);
  const minCount = Math.min(...counts);
  const pool = candidates.filter((_, i) => counts[i] === minCount);
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface RoleCounts { outlaws: number; }

export function assignRolesForRound(
  players: string[],
  roleCounts: RoleCounts,
  tally: RotationTally
): Record<string, TownsquareRole> {
  const remaining = [...players];
  const assignment: Record<string, TownsquareRole> = {};

  const takeFair = (bucket: Bucket, count: number, role: TownsquareRole) => {
    for (let i = 0; i < count; i++) {
      const pick = pickFair(remaining, tally, bucket);
      assignment[pick] = role;
      remaining.splice(remaining.indexOf(pick), 1);
    }
  };

  takeFair('outlaw', roleCounts.outlaws, 'OUTLAW');
  takeFair('detective', 1, 'DETECTIVE');
  takeFair('doctor', 1, 'DOCTOR');
  remaining.forEach(name => { assignment[name] = 'TOWN'; });

  return assignment;
}

export function pickNextModerator(
  players: string[],
  tally: RotationTally,
  currentModerator: string
): string {
  const eligible = players.filter(p => p !== currentModerator);
  return pickFair(eligible, tally, 'moderator');
}
