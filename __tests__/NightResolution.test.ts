import { resolveNight } from '../src/engine/NightResolution';
import type { PlayerProfile, RoundAction } from '../src/types';

const p = (name: string, role: PlayerProfile['role']): PlayerProfile => ({
  name, role, status: 'ACTIVE', isModerator: false,
});

const roster = [p('Alice', 'OUTLAW'), p('Bob', 'DOCTOR'), p('Chitra', 'DETECTIVE'), p('Eve', 'TOWN')];

describe('resolveNight', () => {
  it('the kill lands when the save misses', () => {
    const actions: RoundAction[] = [
      { actor: 'Alice', action: 'KILL', target: 'Eve' },
      { actor: 'Bob', action: 'SAVE', target: 'Chitra' },
    ];
    expect(resolveNight(actions, roster)).toEqual({ victim: 'Eve', saved: false });
  });

  it('the save cancels the kill on the same target', () => {
    const actions: RoundAction[] = [
      { actor: 'Alice', action: 'KILL', target: 'Eve' },
      { actor: 'Bob', action: 'SAVE', target: 'Eve' },
    ];
    expect(resolveNight(actions, roster)).toEqual({ victim: undefined, saved: true });
  });

  it('no kill logged means no victim', () => {
    expect(resolveNight([], roster)).toEqual({ victim: undefined, saved: false });
  });

  it('investigation reads the true role off the roster', () => {
    const guilty = resolveNight([{ actor: 'Chitra', action: 'INVESTIGATE', target: 'Alice' }], roster);
    expect(guilty.investigation).toEqual({ target: 'Alice', isOutlaw: true });

    const innocent = resolveNight([{ actor: 'Chitra', action: 'INVESTIGATE', target: 'Eve' }], roster);
    expect(innocent.investigation).toEqual({ target: 'Eve', isOutlaw: false });
  });

  it('an investigation of an unknown name is dropped rather than guessed', () => {
    const out = resolveNight([{ actor: 'Chitra', action: 'INVESTIGATE', target: 'Nobody' }], roster);
    expect(out.investigation).toBeUndefined();
  });
});
