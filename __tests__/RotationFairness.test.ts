import { assignRolesForRound, pickNextModerator } from '../src/state/RotationFairness';
import type { RotationCounts, RotationTally, TownsquareRole } from '../src/types';

const counts = (partial: Partial<RotationCounts> = {}): RotationCounts => ({
  moderator: 0, outlaw: 0, detective: 0, doctor: 0, town: 0, ...partial,
});

describe('assignRolesForRound', () => {
  const players = ['Alice', 'Bob', 'Chitra', 'Dave', 'Esha', 'Farid', 'Gita', 'Hari'];

  it('assigns exactly the role counts from the balance table (8 players, 2 outlaws)', () => {
    const assignment = assignRolesForRound(players, { outlaws: 2 }, {});
    const byRole = (role: TownsquareRole) =>
      Object.values(assignment).filter(r => r === role).length;

    expect(Object.keys(assignment).sort()).toEqual([...players].sort()); // everyone got a role
    expect(byRole('OUTLAW')).toBe(2);
    expect(byRole('DETECTIVE')).toBe(1);
    expect(byRole('DOCTOR')).toBe(1);
    expect(byRole('TOWN')).toBe(4);
  });

  it('gives OUTLAW to the only player who has never been one', () => {
    const tally: RotationTally = Object.fromEntries(
      players.map(p => [p, counts({ outlaw: p === 'Gita' ? 0 : 3 })])
    );
    const assignment = assignRolesForRound(players, { outlaws: 1 }, tally);
    expect(assignment['Gita']).toBe('OUTLAW');
  });

  it('gives DETECTIVE to the only player who has never been one', () => {
    const tally: RotationTally = Object.fromEntries(
      players.map(p => [p, counts({ detective: p === 'Dave' ? 0 : 2, outlaw: p === 'Dave' ? 5 : 0 })])
    );
    const assignment = assignRolesForRound(players, { outlaws: 1 }, tally);
    expect(assignment['Dave']).toBe('DETECTIVE');
  });

  it('strongly favors a late joiner (absent from tally) for special roles — documented behavior, spec §8', () => {
    const tally: RotationTally = Object.fromEntries(
      players.map(p => [p, counts({ outlaw: 4, detective: 4, doctor: 4 })])
    );
    const withNewcomer = [...players, 'Zara']; // Zara has no tally entry -> all counts read as 0
    const assignment = assignRolesForRound(withNewcomer, { outlaws: 1 }, tally);
    expect(assignment['Zara']).toBe('OUTLAW'); // first special-role draw must pick the only zero-count player
  });

  it('never assigns a player two roles', () => {
    for (let run = 0; run < 25; run++) {
      const assignment = assignRolesForRound(players, { outlaws: 2 }, {});
      expect(Object.keys(assignment)).toHaveLength(players.length);
    }
  });
});

describe('pickNextModerator', () => {
  const players = ['Alice', 'Bob', 'Chitra', 'Dave'];

  it('never picks the current moderator', () => {
    for (let run = 0; run < 25; run++) {
      expect(pickNextModerator(players, {}, 'Alice')).not.toBe('Alice');
    }
  });

  it('picks the eligible player with the fewest moderator turns', () => {
    const tally: RotationTally = {
      Alice: counts({ moderator: 1 }),
      Bob: counts({ moderator: 2 }),
      Chitra: counts({ moderator: 0 }),
      Dave: counts({ moderator: 2 }),
    };
    expect(pickNextModerator(players, tally, 'Alice')).toBe('Chitra');
  });

  it('treats a late joiner as having zero moderator turns', () => {
    const tally: RotationTally = {
      Alice: counts({ moderator: 2 }),
      Bob: counts({ moderator: 1 }),
      Chitra: counts({ moderator: 1 }),
      Dave: counts({ moderator: 1 }),
    };
    expect(pickNextModerator([...players, 'Zara'], tally, 'Alice')).toBe('Zara');
  });
});
