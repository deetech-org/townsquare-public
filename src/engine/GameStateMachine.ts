// A single NIGHT phase (v3): the silent-night ritual is one console interaction on the
// Moderator's device. The old NIGHT_OUTLAW/NIGHT_DOCTOR/NIGHT_DETECTIVE sub-phases were
// v2 fossils that sequenced per-role SMS prompts — with those transports retired, the
// sub-phases modeled nothing and blocked night resolution (4-AVD run-01, TC-6).
export type RoundPhase =
  | 'LOBBY'
  | 'ROLE_ASSIGNMENT'
  | 'NIGHT'
  | 'DAY_NARRATION'
  | 'DAY_NOMINATION'
  | 'DAY_VOTE'
  | 'ROUND_OVER';

export const ALLOWED_TRANSITIONS: Record<RoundPhase, RoundPhase[]> = {
  LOBBY:           ['ROLE_ASSIGNMENT'],
  ROLE_ASSIGNMENT: ['NIGHT'],
  NIGHT:           ['DAY_NARRATION', 'ROLE_ASSIGNMENT'], // back-edge: re-show the roles QR for a straggler (ciphertexts are deterministic, so the QR regenerates identically)
  DAY_NARRATION:   ['DAY_NOMINATION'],
  DAY_NOMINATION:  ['DAY_VOTE'],
  DAY_VOTE:        ['NIGHT', 'ROUND_OVER'], // loop to the next night, or the round ends
  ROUND_OVER:      [],
};

export class GameStateMachine {
  private currentPhase: RoundPhase;
  private readonly roundId: string;

  constructor(roundId: string, initialPhase: RoundPhase = 'LOBBY') {
    this.roundId = roundId;
    this.currentPhase = initialPhase;
  }

  public getRoundId(): string {
    return this.roundId;
  }

  public getPhase(): RoundPhase {
    return this.currentPhase;
  }

  public canTransitionTo(next: RoundPhase): boolean {
    return ALLOWED_TRANSITIONS[this.currentPhase].includes(next);
  }

  public async transitionTo(next: RoundPhase): Promise<void> {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Illegal phase transition: ${this.currentPhase} -> ${next}`);
    }
    this.currentPhase = next;
    // Persistence of the new phase happens via PersistenceStore.save() on the Moderator device.
  }
}
