import { GameStateMachine, RoundPhase } from '../src/engine/GameStateMachine';

describe('GameStateMachine transition table', () => {
  it('starts in LOBBY by default', () => {
    expect(new GameStateMachine('r1').getPhase()).toBe('LOBBY');
  });

  it('walks the full happy path of a round', async () => {
    const fsm = new GameStateMachine('r1');
    const path: RoundPhase[] = [
      'ROLE_ASSIGNMENT',
      'NIGHT',
      'DAY_NARRATION',
      'DAY_NOMINATION',
      'DAY_VOTE',
    ];
    for (const phase of path) {
      await fsm.transitionTo(phase);
      expect(fsm.getPhase()).toBe(phase);
    }
  });

  it('loops from DAY_VOTE back into the next night', async () => {
    const fsm = new GameStateMachine('r1', 'DAY_VOTE');
    await fsm.transitionTo('NIGHT');
    expect(fsm.getPhase()).toBe('NIGHT');
  });

  it('ends the round from DAY_VOTE', async () => {
    const fsm = new GameStateMachine('r1', 'DAY_VOTE');
    await fsm.transitionTo('ROUND_OVER');
    expect(fsm.getPhase()).toBe('ROUND_OVER');
  });

  it('rejects the illegal jump LOBBY -> ROUND_OVER', async () => {
    const fsm = new GameStateMachine('r1');
    await expect(fsm.transitionTo('ROUND_OVER')).rejects.toThrow('Illegal phase transition');
    expect(fsm.getPhase()).toBe('LOBBY'); // state unchanged after a rejected transition
  });

  it('rejects skipping the narration after night', async () => {
    const fsm = new GameStateMachine('r1', 'NIGHT');
    await expect(fsm.transitionTo('DAY_NOMINATION')).rejects.toThrow('Illegal phase transition');
  });

  it('night resolves directly to DAY_NARRATION (v3 single NIGHT phase — the TC-6 fix)', () => {
    const fsm = new GameStateMachine('r1', 'NIGHT');
    expect(fsm.canTransitionTo('DAY_NARRATION')).toBe(true);
  });

  it('night allows the back-edge to ROLE_ASSIGNMENT (re-show the roles QR)', () => {
    const fsm = new GameStateMachine('r1', 'NIGHT');
    expect(fsm.canTransitionTo('ROLE_ASSIGNMENT')).toBe(true);
  });

  it('allows no transitions out of ROUND_OVER', () => {
    const fsm = new GameStateMachine('r1', 'ROUND_OVER');
    const allPhases: RoundPhase[] = [
      'LOBBY', 'ROLE_ASSIGNMENT', 'NIGHT',
      'DAY_NARRATION', 'DAY_NOMINATION', 'DAY_VOTE', 'ROUND_OVER',
    ];
    for (const phase of allPhases) {
      expect(fsm.canTransitionTo(phase)).toBe(false);
    }
  });
});
