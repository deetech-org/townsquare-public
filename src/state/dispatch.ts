import type {
  JoinSessionPayload,
  JoinAckPayload,
  RolesPayload,
  SyncPayload,
  BallotPayload,
  ModeratorHandoffPayload,
  PlayerProfile,
  RotationTally,
  SessionState,
  TownsquareRole,
  PlayerStatus,
} from '../types';
import { ALLOWED_TRANSITIONS, RoundPhase } from '../engine/GameStateMachine';
import { assignRolesForRound } from './RotationFairness';
import { resolveNight } from '../engine/NightResolution';
import { outlawCountFor, MIN_ROLE_HOLDERS, MAX_ROLE_HOLDERS } from '../engine/RoleTable';

export interface AppState {
  session: SessionState | null;
  alert: string | null;
}

export type AppAction =
  | { type: 'HYDRATED'; session: SessionState | null }
  | { type: 'PROFILE_CREATED'; name: string }
  | { type: 'PROFILE_CLEARED' }
  | { type: 'SESSION_CREATED' }
  | { type: 'SESSION_CANCELLED' }
  | { type: 'SESSION_LEFT' }
  | { type: 'JOIN_SCANNED'; payload: JoinSessionPayload }
  | { type: 'JOIN_ACK_SCANNED'; payload: JoinAckPayload }
  | { type: 'ROLES_SCANNED'; role: TownsquareRole; companions?: string[]; roundNumber: number }
  | { type: 'STATE_SYNC_SCANNED'; payload: SyncPayload }
  | { type: 'BALLOT_SCANNED'; payload: BallotPayload }
  | { type: 'HANDOFF_SCANNED'; payload: ModeratorHandoffPayload }
  | { type: 'NIGHT_ACTION_LOGGED'; actor: string; action: 'KILL' | 'SAVE' | 'INVESTIGATE'; target: string }
  | { type: 'ROUND_STARTED' }
  | { type: 'PHASE_ADVANCED'; to: RoundPhase }
  | { type: 'NIGHT_RESOLVED' }
  | { type: 'PLAYER_ELIMINATED'; name: string }
  | { type: 'PLAYER_REMOVED'; name: string }
  | { type: 'ROUND_ENDED' }
  | { type: 'ALERT_CLEARED' }
  | { type: 'GAME_NIGHT_CLEARED' };

export const STALE_SESSION_ALERT = 'This QR code is from a past game session and can\'t be used.';

export function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function withAlert(state: AppState, alert: string): AppState {
  return { ...state, alert };
}

function tallyBucketFor(role: TownsquareRole): keyof RotationTally[string] | null {
  switch (role) {
    case 'OUTLAW': return 'outlaw';
    case 'DETECTIVE': return 'detective';
    case 'DOCTOR': return 'doctor';
    case 'TOWN': return 'town';
    default: return null;
  }
}

function bumpTally(tally: RotationTally, name: string, bucket: keyof RotationTally[string]): RotationTally {
  const current = tally[name] ?? { moderator: 0, outlaw: 0, detective: 0, doctor: 0, town: 0 };
  return { ...tally, [name]: { ...current, [bucket]: current[bucket] + 1 } };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  const session = state.session;

  switch (action.type) {
    case 'HYDRATED':
      return { session: action.session, alert: null };

    case 'PROFILE_CREATED':
      return {
        alert: null,
        session: {
          sessionId: '',
          deviceMode: 'PLAYER',
          roundNumber: 0,
          phase: 'LOBBY',
          self: {
            name: action.name,
            role: 'UNASSIGNED',
            status: 'WAITING_FOR_MODERATOR',
            isModerator: false,
          },
          rotationTally: {},
        },
      };

    case 'SESSION_CREATED': {
      if (!session) return withAlert(state, 'Create your profile first.');
      return {
        alert: null,
        session: {
          ...session,
          sessionId: newSessionId(),
          deviceMode: 'MODERATOR',
          roundNumber: 1,
          phase: 'LOBBY',
          self: { ...session.self, isModerator: true, status: 'ACTIVE' },
          roster: [{ ...session.self, isModerator: true, status: 'ACTIVE' }],
          pendingActions: [],
          rotationTally: {},
          ballots: {},
        },
      };
    }

    case 'PROFILE_CLEARED': {
      // "Change name" — only before joining/creating a game: once in a session,
      // the name is in someone's roster and changing it would desync identities.
      if (!session || session.sessionId !== '') {
        return withAlert(state, 'Leave the game night first to change your name.');
      }
      return { session: null, alert: null };
    }

    case 'SESSION_LEFT': {
      // A player leaves the game night: device returns to the joinable
      // pre-session state (their name is kept). The room handles the social part.
      if (!session || session.deviceMode !== 'PLAYER' || session.sessionId === '') {
        return withAlert(state, 'You are not in a game night.');
      }
      return {
        alert: null,
        session: {
          sessionId: '',
          deviceMode: 'PLAYER',
          roundNumber: 0,
          phase: 'LOBBY',
          self: { ...session.self, isModerator: false, role: 'UNASSIGNED', status: 'WAITING_FOR_MODERATOR' },
          rotationTally: {},
        },
      };
    }

    case 'SESSION_CANCELLED': {
      // Undo an accidental "Create Game Night" (e.g. someone else is already the
      // Moderator) — only from the lobby, before any round has started. Returns
      // the device to the joinable pre-session state; the profile is kept.
      if (!session || session.deviceMode !== 'MODERATOR' || session.phase !== 'LOBBY') {
        return withAlert(state, 'A game night can only be cancelled from the lobby.');
      }
      return {
        alert: null,
        session: {
          sessionId: '',
          deviceMode: 'PLAYER',
          roundNumber: 0,
          phase: 'LOBBY',
          self: { ...session.self, isModerator: false, role: 'UNASSIGNED', status: 'WAITING_FOR_MODERATOR' },
          rotationTally: {},
        },
      };
    }

    case 'JOIN_SCANNED': {
      if (!session) return withAlert(state, 'Create your profile first.');
      return {
        alert: null,
        session: {
          ...session,
          sessionId: action.payload.sid,
          roundNumber: action.payload.roundNumber,
          phase: 'LOBBY',
          self: { ...session.self, status: 'ACTIVE' },
        },
      };
    }

    case 'JOIN_ACK_SCANNED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) {
        return withAlert(state, 'Join confirmations go to the Moderator\'s device.');
      }
      if (action.payload.sid !== session.sessionId) {
        return withAlert(state, STALE_SESSION_ALERT);
      }
      const roster = session.roster;
      if (roster.some(p => p.name === action.payload.name)) {
        return withAlert(state, `A player named ${action.payload.name} is already in the roster.`);
      }
      const joiner: PlayerProfile = {
        name: action.payload.name,
        role: 'UNASSIGNED',
        status: 'ACTIVE',
        isModerator: false,
      };
      return { alert: null, session: { ...session, roster: [...roster, joiner] } };
    }

    case 'ROLES_SCANNED': {
      if (!session) {
        return withAlert(state, 'Role assignments are for player devices.');
      }
      if (session.deviceMode === 'MODERATOR') {
        // Outgoing-moderator step-down: after handing off, scanning the successor's
        // roles QR for a NEWER round is how this device rejoins as a player. Any
        // other moderator-mode scan is a mistake — an active moderator holds no role.
        if (session.phase !== 'ROUND_OVER' || action.roundNumber <= session.roundNumber) {
          return withAlert(state, 'Role assignments are for player devices.');
        }
        return {
          alert: null,
          session: {
            ...session,
            deviceMode: 'PLAYER',
            roundNumber: action.roundNumber,
            phase: 'ROLE_ASSIGNMENT',
            companions: action.companions,
            self: { ...session.self, isModerator: false, role: action.role, status: 'ACTIVE' },
            roster: undefined,
            pendingActions: undefined,
            ballots: undefined,
            lastOutcome: undefined,
          },
        };
      }
      return {
        alert: null,
        session: {
          ...session,
          roundNumber: action.roundNumber,
          phase: 'ROLE_ASSIGNMENT',
          companions: action.companions,
          self: { ...session.self, role: action.role, status: 'ACTIVE' },
        },
      };
    }

    case 'STATE_SYNC_SCANNED': {
      if (!session || session.deviceMode !== 'PLAYER') {
        return withAlert(state, 'State sync is for player devices.');
      }
      if (action.payload.sid !== session.sessionId) {
        return withAlert(state, STALE_SESSION_ALERT);
      }

      const roster = action.payload.statusCodes.map(([name, code]) => {
        let status: PlayerStatus = 'ACTIVE'; // 'M' (Moderator) is also ACTIVE
        if (code === 'D') status = 'DECEASED';
        else if (code === 'E') status = 'ELIMINATED';
        else if (code === 'W') status = 'WAITING_FOR_MODERATOR';
        return {
          name,
          role: 'UNASSIGNED' as const,
          status,
          isModerator: code === 'M',
        };
      });

      let selfStatus = session.self.status;
      const match = action.payload.statusCodes.find(([name]) => name === session.self.name);
      if (match) {
        const code = match[1];
        if (code === 'A') selfStatus = 'ACTIVE';
        else if (code === 'D') selfStatus = 'DECEASED';
        else if (code === 'E') selfStatus = 'ELIMINATED';
      }

      return {
        alert: null,
        session: {
          ...session,
          roundNumber: action.payload.roundNumber,
          phase: action.payload.phase,
          self: { ...session.self, status: selfStatus },
          roster,
        },
      };
    }

    case 'BALLOT_SCANNED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) {
        return withAlert(state, 'Ballots go to the Moderator\'s device.');
      }
      if (action.payload.sid !== session.sessionId) {
        return withAlert(state, STALE_SESSION_ALERT);
      }
      if (action.payload.roundNumber !== session.roundNumber) {
        return withAlert(state, 'This ballot is from a different round.');
      }

      const ballots = session.ballots ?? {};
      const voterObj = session.roster.find(p => p.name === action.payload.voter);
      if (!voterObj || voterObj.status !== 'ACTIVE') {
        return withAlert(state, `Voter ${action.payload.voter} is not active in the roster.`);
      }
      const targetObj = session.roster.find(p => p.name === action.payload.target);
      if (!targetObj || targetObj.status !== 'ACTIVE') {
        return withAlert(state, `Target ${action.payload.target} is not active in the roster.`);
      }
      if (targetObj.isModerator) {
        return withAlert(state, 'The Moderator holds no role and cannot be voted out.');
      }

      return {
        alert: null,
        session: {
          ...session,
          ballots: { ...ballots, [action.payload.voter]: action.payload.target },
        },
      };
    }

    case 'HANDOFF_SCANNED': {
      if (!session) return withAlert(state, 'Create your profile first.');
      if (session.sessionId && action.payload.sid !== session.sessionId) {
        return withAlert(state, STALE_SESSION_ALERT);
      }
      const roster = action.payload.roster.map(p => ({
        ...p,
        isModerator: p.name === session.self.name,
        role: 'UNASSIGNED' as TownsquareRole,
        status: 'ACTIVE' as const,
      }));
      return {
        alert: null,
        session: {
          ...session,
          sessionId: action.payload.sid,
          deviceMode: 'MODERATOR',
          roundNumber: action.payload.roundNumber,
          phase: 'LOBBY',
          self: { ...session.self, isModerator: true, role: 'UNASSIGNED', status: 'ACTIVE' },
          roster,
          pendingActions: [],
          rotationTally: action.payload.rotationTally,
          lastOutcome: undefined,
          ballots: {},
        },
      };
    }

    case 'NIGHT_ACTION_LOGGED': {
      if (!session || session.deviceMode !== 'MODERATOR') {
        return withAlert(state, 'Night actions go to the Moderator\'s device.');
      }
      const pending = session.pendingActions ?? [];
      const already = pending.some(a => a.actor === action.actor && a.action === action.action);
      if (already) {
        return withAlert(state, `${action.actor} already logged a ${action.action} action this night.`);
      }
      return {
        alert: null,
        session: {
          ...session,
          pendingActions: [...pending, { actor: action.actor, action: action.action, target: action.target }],
        },
      };
    }

    case 'ROUND_STARTED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) {
        return withAlert(state, 'Only the Moderator can start a round.');
      }
      const holders = session.roster.filter(p => !p.isModerator && p.status === 'ACTIVE');
      const outlaws = outlawCountFor(holders.length);
      if (outlaws === null) {
        return withAlert(state, `Need ${MIN_ROLE_HOLDERS}-${MAX_ROLE_HOLDERS} joined players besides the Moderator (currently ${holders.length}).`);
      }
      const assignment = assignRolesForRound(holders.map(p => p.name), { outlaws }, session.rotationTally);
      const roster = session.roster.map(p =>
        p.isModerator ? p : { ...p, role: assignment[p.name] ?? p.role }
      );
      return {
        alert: null,
        session: { ...session, roster, phase: 'ROLE_ASSIGNMENT', pendingActions: [], lastOutcome: undefined, lastElimination: undefined, ballots: {} },
      };
    }

    case 'PHASE_ADVANCED': {
      if (!session) return withAlert(state, 'No active session.');
      if (!ALLOWED_TRANSITIONS[session.phase].includes(action.to)) {
        return withAlert(state, `Illegal phase transition: ${session.phase} -> ${action.to}`);
      }
      const ballots = action.to === 'DAY_VOTE' ? {} : session.ballots;
      const lastElimination = action.to === 'NIGHT' ? undefined : session.lastElimination;
      return { alert: null, session: { ...session, phase: action.to, ballots, lastElimination } };
    }

    case 'NIGHT_RESOLVED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) {
        return withAlert(state, 'Only the Moderator can resolve the night.');
      }
      if (!ALLOWED_TRANSITIONS[session.phase].includes('DAY_NARRATION')) {
        return withAlert(state, `Cannot resolve the night from ${session.phase}.`);
      }
      const outcome = resolveNight(session.pendingActions ?? [], session.roster);
      const roster = session.roster.map(p =>
        p.name === outcome.victim ? { ...p, status: 'DECEASED' as const } : p
      );
      return {
        alert: null,
        session: { ...session, roster, pendingActions: [], lastOutcome: outcome, phase: 'DAY_NARRATION' },
      };
    }

    case 'PLAYER_ELIMINATED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) {
        return withAlert(state, 'Only the Moderator can log an elimination.');
      }
      if (session.phase !== 'DAY_VOTE') {
        return withAlert(state, 'Eliminations happen during the day vote.');
      }
      if (session.roster.find(p => p.name === action.name)?.isModerator) {
        return withAlert(state, 'The Moderator holds no role and cannot be voted out.');
      }
      const roster = session.roster.map(p =>
        p.name === action.name ? { ...p, status: 'ELIMINATED' as const } : p
      );
      return { alert: null, session: { ...session, roster, lastElimination: action.name } };
    }

    case 'PLAYER_REMOVED': {
      // A player left the game night: the Moderator drops them from the roster so
      // no role is dealt to an empty chair. Between rounds only — removing someone
      // mid-round would corrupt alive-counts and the win condition (play it out,
      // or eliminate them at the vote, as a physical game would).
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) {
        return withAlert(state, 'Only the Moderator can remove a player.');
      }
      if (session.phase !== 'LOBBY' && session.phase !== 'ROUND_OVER') {
        return withAlert(state, 'Players can only be removed between rounds (lobby or round over).');
      }
      const target = session.roster.find(p => p.name === action.name);
      if (!target) {
        return withAlert(state, `${action.name} is not in the roster.`);
      }
      if (target.isModerator) {
        return withAlert(state, 'The Moderator cannot remove themselves — cancel the game night or hand off instead.');
      }
      // rotationTally entry is kept: harmless, and preserves fairness if they rejoin.
      return { alert: null, session: { ...session, roster: session.roster.filter(p => p.name !== action.name) } };
    }

    case 'ROUND_ENDED': {
      if (!session || session.deviceMode !== 'MODERATOR' || !session.roster) {
        return withAlert(state, 'Only the Moderator can end a round.');
      }
      let tally = session.rotationTally;
      for (const p of session.roster) {
        if (p.isModerator) {
          tally = bumpTally(tally, p.name, 'moderator');
        } else {
          const bucket = tallyBucketFor(p.role);
          if (bucket) tally = bumpTally(tally, p.name, bucket);
        }
      }
      return { alert: null, session: { ...session, rotationTally: tally, phase: 'ROUND_OVER' } };
    }

    case 'ALERT_CLEARED':
      return { ...state, alert: null };

    case 'GAME_NIGHT_CLEARED':
      return { session: null, alert: null };
  }
}
