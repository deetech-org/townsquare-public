import { QRCodec } from './QRCodec';
import type { RoleCode, SessionState, TownsquareRole } from '../types';
import type { AppAction } from '../state/dispatch';

const ROLE_BY_CODE: Record<RoleCode, TownsquareRole> = {
  O: 'OUTLAW', E: 'DETECTIVE', D: 'DOCTOR', T: 'TOWN',
};

export interface RolesScanResult {
  ok: boolean;
  title: string;
  message: string;
}

/**
 * Shared roles-QR scan pipeline: decode -> sid check -> decrypt this device's own
 * entry -> dispatch ROLES_SCANNED. Used by PlayerScreen (normal assignment and
 * "new round" re-assignment) and by ModeratorScreen's outgoing-moderator
 * step-down ("Handed off — join the next round as a player").
 * The reducer owns mode/round guards; this owns wire validation and crypto.
 */
export async function scanRolesPayload(
  data: string,
  session: SessionState,
  dispatch: (action: AppAction) => void
): Promise<RolesScanResult> {
  const payload = QRCodec.decode(data);
  if (!payload || payload.kind !== 'roles') {
    return { ok: false, title: 'Error', message: 'Invalid QR code. Please scan the Moderator\'s Roles QR.' };
  }
  if (payload.sid !== session.sessionId) {
    return { ok: false, title: 'Error', message: 'This QR code is from a different game session.' };
  }
  const encrypted = payload.encryptedRoles[session.self.name];
  if (!encrypted) {
    return { ok: false, title: 'Error', message: `Your name (${session.self.name}) is not registered in this round's role assignment.` };
  }

  try {
    const decrypted = await QRCodec.decryptRole(encrypted, session.self.name, payload.sid, payload.roundNumber);
    const parts = decrypted.split('|');
    const roleCode = parts[0];
    if (roleCode !== 'O' && roleCode !== 'E' && roleCode !== 'D' && roleCode !== 'T') {
      throw new Error('Invalid role code');
    }
    dispatch({
      type: 'ROLES_SCANNED',
      role: ROLE_BY_CODE[roleCode],
      companions: parts[1] ? parts[1].split(',') : undefined,
      roundNumber: payload.roundNumber,
    });
    return { ok: true, title: 'Success', message: 'Role decrypted successfully! Hold down the card to reveal it.' };
  } catch {
    return { ok: false, title: 'Error', message: 'Failed to reveal your role. Make sure you joined under this same name.' };
  }
}
