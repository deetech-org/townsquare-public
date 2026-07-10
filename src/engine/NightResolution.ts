import type { NightOutcome, PlayerProfile, RoundAction } from '../types';

/**
 * Resolves the logged night actions into an outcome:
 * the KILL lands unless the Doctor's SAVE named the same target;
 * the INVESTIGATE result reads the target's true role off the roster.
 */
export function resolveNight(actions: RoundAction[], roster: PlayerProfile[]): NightOutcome {
  const kill = actions.find(a => a.action === 'KILL');
  const save = actions.find(a => a.action === 'SAVE');
  const investigate = actions.find(a => a.action === 'INVESTIGATE');

  const saved = !!kill && !!save && kill.target === save.target;
  const outcome: NightOutcome = {
    victim: kill && !saved ? kill.target : undefined,
    saved,
  };

  if (investigate) {
    const target = roster.find(p => p.name === investigate.target);
    if (target) {
      outcome.investigation = { target: target.name, isOutlaw: target.role === 'OUTLAW' };
    }
  }

  return outcome;
}
