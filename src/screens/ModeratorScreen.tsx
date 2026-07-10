import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSession } from '../state/SessionContext';
import { AathichoodiCard } from '../components/AathichoodiCard';
import { TargetPicker } from '../components/TargetPicker';
import { QRScannerView } from '../components/QRScannerView';
import { DevPayloadText } from '../components/DevPayloadText';
import { QRCodec } from '../services/QRCodec';
import { scanRolesPayload } from '../services/rolesScan';
import { colors } from '../theme';
import { BRAND_MARK } from '../components/BrandMark';
import { effectiveMinRoleHolders } from '../engine/RoleTable';
import { pickNextModerator } from '../state/RotationFairness';

export function ModeratorScreen() {
  const { state, dispatch } = useSession();
  const session = state.session;
  const [activeScanner, setActiveScanner] = useState<'joinAck' | 'ballot' | 'stepDownRoles' | null>(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [encryptedRoles, setEncryptedRoles] = useState<Record<string, string> | null>(null);
  const [revealRoles, setRevealRoles] = useState(false);

  if (!session) return null;
  const { sessionId, roundNumber, phase, roster, pendingActions, lastOutcome, lastElimination, ballots } = session;

  const roleHolders = (roster ?? []).filter(p => !p.isModerator && p.status === 'ACTIVE');

  // Win condition checks
  const outlawsCount = roleHolders.filter(p => p.role === 'OUTLAW').length;
  const townCount = roleHolders.filter(p => p.role !== 'OUTLAW').length;
  let winner: 'OUTLAWS' | 'TOWN' | null = null;
  if (outlawsCount === 0 && roleHolders.length > 0) {
    winner = 'TOWN';
  } else if (outlawsCount >= townCount && roleHolders.length > 0) {
    winner = 'OUTLAWS';
  }
  // Town wins read green (the jade role colour), Outlaws red (crimson).
  const winColor = winner === 'TOWN' ? colors.roleTown : colors.roleOutlaw;

  // Distinct win cue: a short double-buzz the moment a faction clinches the round.
  // Vibration ships with React Native — no audio dependency or asset needed.
  useEffect(() => {
    if (winner) Vibration.vibrate([0, 220, 120, 220]);
  }, [winner]);

  // Next-moderator suggestion runs through the SAME fairness engine that deals
  // roles, so moderator turns rotate by the shuffle-bag too. Memoized on the
  // roster/tally so ties don't re-roll on every unrelated re-render.
  const suggestedNext = useMemo(() => {
    const activeNames = (roster ?? []).filter(p => p.status === 'ACTIVE').map(p => p.name);
    const hasSuccessor = activeNames.some(n => n !== session.self.name);
    return hasSuccessor ? pickNextModerator(activeNames, session.rotationTally, session.self.name) : '';
  }, [roster, session.rotationTally, session.self.name]);

  // Encrypt roles asynchronously when entering ROLE_ASSIGNMENT phase
  useEffect(() => {
    if (phase === 'ROLE_ASSIGNMENT' && roster) {
      const runEncryption = async () => {
        const map: Record<string, string> = {};
        const outlaws = roster.filter(p => p.role === 'OUTLAW').map(p => p.name);
        const roleCodes: Record<string, string> = { OUTLAW: 'O', DETECTIVE: 'E', DOCTOR: 'D', TOWN: 'T' };

        for (const p of roster) {
          if (p.isModerator) continue;
          const code = roleCodes[p.role] ?? 'T';
          let plaintext = code;
          if (p.role === 'OUTLAW') {
            const companions = outlaws.filter(name => name !== p.name);
            if (companions.length > 0) {
              plaintext += `|${companions.join(',')}`;
            }
          }
          const ciphertext = await QRCodec.encryptRole(plaintext, p.name, sessionId, session.roundNumber);
          map[p.name] = ciphertext;
        }
        setEncryptedRoles(map);
      };
      runEncryption();
    } else {
      setEncryptedRoles(null);
    }
  }, [phase, roster, sessionId, session.roundNumber]);

  const confirmRemove = (name: string) => {
    Alert.alert(
      `Remove ${name}?`,
      'They will not be dealt a role in the next round. (They can rejoin later via the join QR.)',
      [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => dispatch({ type: 'PLAYER_REMOVED', name }) }]
    );
  };

  const handleJoinAckScanned = (data: string) => {
    const payload = QRCodec.decode(data);
    if (!payload || payload.kind !== 'joinAck') {
      Alert.alert('Error', 'Invalid QR code. Please scan the Player\'s JoinAck QR.');
      setActiveScanner(null);
      return;
    }
    dispatch({ type: 'JOIN_ACK_SCANNED', payload });
    setActiveScanner(null);
  };

  // Outgoing-moderator step-down: scanning the successor's Round 2 roles QR
  // demotes this device to a player seat (reducer guards phase/round).
  const handleStepDownRolesScanned = async (data: string) => {
    const result = await scanRolesPayload(data, session, dispatch);
    Alert.alert(result.title, result.message);
    setActiveScanner(null);
  };

  const handleBallotScanned = (data: string) => {
    const payload = QRCodec.decode(data);
    if (!payload || payload.kind !== 'ballot') {
      Alert.alert('Error', 'Invalid QR code. Please scan the Player\'s Ballot QR.');
      setActiveScanner(null);
      return;
    }
    dispatch({ type: 'BALLOT_SCANNED', payload });
    setActiveScanner(null);
  };

  // Compile state statusCodes for player sync QR.
  // 'M' marks the Moderator: player devices need it to exclude them from ballot
  // pickers — the Moderator holds no role and must never be a votable suspect.
  const statusCodes = (roster ?? []).map(p => {
    let code = 'A';
    if (p.isModerator) code = 'M';
    else if (p.status === 'DECEASED') code = 'D';
    else if (p.status === 'ELIMINATED') code = 'E';
    else if (p.status === 'WAITING_FOR_MODERATOR') code = 'W';
    return [p.name, code] as [string, string];
  });

  // Each QR is encoded only in the phase that actually shows it — not on every
  // render. (Encoding them all eagerly re-serialized off-screen payloads and
  // spammed the [QR encode] dev log, e.g. a handoff QR with an empty tally
  // during round 1, long before it's ever displayed.)
  const joinQR = phase === 'LOBBY'
    ? QRCodec.encode({ kind: 'join', sid: sessionId, roundNumber, moderatorName: session.self.name })
    : null;

  const syncQR = (phase === 'DAY_NARRATION' || phase === 'DAY_NOMINATION')
    ? QRCodec.encode({ kind: 'sync', sid: sessionId, roundNumber, phase, statusCodes })
    : null;

  const handoffQR = phase === 'ROUND_OVER'
    ? QRCodec.encode({
        kind: 'handoff',
        sid: sessionId,
        // +1: the successor moderates the NEXT round. Encoded only at ROUND_OVER —
        // after ROUND_ENDED has populated the rotation tally the successor inherits,
        // and §6.3's keystream freshness depends on the round number changing.
        roundNumber: roundNumber + 1,
        roster: roster ?? [],
        rotationTally: session.rotationTally,
      })
    : null;

  const rolesQR = encryptedRoles
    ? QRCodec.encode({ kind: 'roles', sid: sessionId, roundNumber, encryptedRoles })
    : null;

  // Direct entry dispatch mockers for Silent Night gestures
  const logNightAction = (actorType: 'OUTLAW' | 'DOCTOR' | 'DETECTIVE', actionType: 'KILL' | 'SAVE' | 'INVESTIGATE', target: string) => {
    dispatch({
      type: 'NIGHT_ACTION_LOGGED',
      actor: actorType,
      action: actionType,
      target,
    });
  };

  if (activeScanner === 'joinAck') {
    return (
      <QRScannerView
        title="Scan Player's Join Confirmation QR"
        onScanned={handleJoinAckScanned}
        onCancel={() => setActiveScanner(null)}
      />
    );
  }

  if (activeScanner === 'ballot') {
    return (
      <QRScannerView
        title="Scan Player's Secret Ballot QR"
        onScanned={handleBallotScanned}
        onCancel={() => setActiveScanner(null)}
      />
    );
  }

  if (activeScanner === 'stepDownRoles') {
    return (
      <QRScannerView
        title="Scan the new Moderator's Roles QR to join as a player"
        onScanned={handleStepDownRolesScanned}
        onCancel={() => setActiveScanner(null)}
      />
    );
  }

  const outlawAction = (pendingActions ?? []).find(a => a.action === 'KILL');
  const doctorAction = (pendingActions ?? []).find(a => a.action === 'SAVE');
  const detectiveAction = (pendingActions ?? []).find(a => a.action === 'INVESTIGATE');

  // Detective inspection logic
  let detectiveResult = '';
  if (detectiveAction && roster) {
    const inspected = roster.find(p => p.name === detectiveAction.target);
    if (inspected) {
      detectiveResult = inspected.role === 'OUTLAW' ? 'GUILTY (OUTLAW)' : 'INNOCENT (TOWN)';
    }
  }

  // Ballot vote compilers
  const voteList = Object.entries(ballots ?? {});
  const voteTally: Record<string, number> = {};
  for (const [, target] of voteList) {
    voteTally[target] = (voteTally[target] ?? 0) + 1;
  }
  const voteCounts = Object.entries(voteTally).sort((a, b) => b[1] - a[1]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Image
          source={BRAND_MARK}
          style={[styles.headerIcon, (phase === 'LOBBY' || phase === 'ROUND_OVER') && { opacity: 0.5 }]}
          resizeMode="contain"
        />
        <Text style={styles.title}>Moderator Dashboard</Text>
        <Text style={styles.badge}>Round {roundNumber} — {phase}</Text>
      </View>

      {phase === 'LOBBY' && (
        <>
          <View style={styles.qrCard}>
            <Text style={styles.sectionTitle}>1. Players Scan to Join:</Text>
            <View style={styles.qrWrap}><QRCode value={joinQR!} size={150} /></View>
            <DevPayloadText payload={joinQR!} />
          </View>

          <Pressable style={styles.button} onPress={() => setActiveScanner('joinAck')}>
            <Text style={styles.buttonText}>2. Scan Player's joinAck QR</Text>
          </Pressable>

          <View style={styles.rosterCard}>
            <Text style={styles.sectionTitle}>Roster ({roleHolders.length} players joined):</Text>
            {roleHolders.map(p => (
              <View key={p.name} style={styles.rosterLine}>
                <Text style={styles.rosterRow}>✓ {p.name}</Text>
                <Pressable onPress={() => confirmRemove(p.name)}>
                  <Text style={styles.removeText}>remove</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Pressable
            style={[styles.primary, roleHolders.length < effectiveMinRoleHolders() && styles.buttonDisabled]}
            disabled={roleHolders.length < effectiveMinRoleHolders()}
            onPress={() => dispatch({ type: 'ROUND_STARTED' })}
          >
            <Text style={styles.primaryText}>Start Round</Text>
          </Pressable>
          {__DEV__ && roleHolders.length < 6 && roleHolders.length >= 3 && (
            <Text style={styles.dim}>DEV build: starting with {roleHolders.length} players (release minimum is 6).</Text>
          )}
          <Pressable
            style={styles.danger}
            onPress={() => {
              const cancel = () => dispatch({ type: 'SESSION_CANCELLED' });
              if (roleHolders.length > 0) {
                Alert.alert(
                  'Cancel this game night?',
                  `${roleHolders.length} player(s) already joined — they will need to scan the real Moderator's join QR instead.`,
                  [{ text: 'Keep hosting', style: 'cancel' }, { text: 'Cancel game night', style: 'destructive', onPress: cancel }]
                );
              } else {
                cancel();
              }
            }}
          >
            <Text style={styles.dangerText}>Cancel — someone else is the Moderator</Text>
          </Pressable>
        </>
      )}

      {phase === 'ROLE_ASSIGNMENT' && (
        <>
          <View style={styles.qrCard}>
            <Text style={styles.sectionTitle}>Players Scan to Receive Roles:</Text>
            {rolesQR ? (
              <>
                <View style={styles.qrWrap}>
                  <QRCode value={rolesQR} size={190} />
                </View>
                <DevPayloadText payload={rolesQR} />
              </>
            ) : (
              <Text style={styles.hint}>Encrypting roles...</Text>
            )}
          </View>

          <Pressable style={styles.primary} onPress={() => dispatch({ type: 'PHASE_ADVANCED', to: 'NIGHT' })}>
            <Text style={styles.primaryText}>Enter Night Phase</Text>
          </Pressable>
        </>
      )}

      {/* Direct-Entry Quick-Log Console for Silent Night gestures */}
      {phase === 'NIGHT' && (
        <View style={styles.consoleCard}>
          <Text style={styles.sectionTitle}>Silent Night Console</Text>
          <Text style={styles.hint}>Ask everyone to close eyes. Call roles in turn and log targets:</Text>

          {/* 1. Outlaw Kill Target */}
          <View style={styles.pickerBox}>
            <Text style={styles.pickerLabel}>1. Outlaws (Kill): {outlawAction ? outlawAction.target : 'None'}</Text>
            {!outlawAction && (
              <TargetPicker
                prompt="Select Outlaws' target:"
                candidates={roleHolders.map(p => p.name)}
                onPick={name => logNightAction('OUTLAW', 'KILL', name)}
              />
            )}
          </View>

          {/* 2. Doctor Save Target */}
          <View style={styles.pickerBox}>
            <Text style={styles.pickerLabel}>2. Doctor (Save): {doctorAction ? doctorAction.target : 'None'}</Text>
            {!doctorAction && (
              <TargetPicker
                prompt="Select Doctor's target:"
                candidates={roleHolders.map(p => p.name)}
                onPick={name => logNightAction('DOCTOR', 'SAVE', name)}
              />
            )}
          </View>

          {/* 3. Detective Inspect Target */}
          <View style={styles.pickerBox}>
            <Text style={styles.pickerLabel}>
              3. Detective (Inspect): {detectiveAction ? `${detectiveAction.target} → ${detectiveResult}` : 'None'}
            </Text>
            {!detectiveAction && (
              <TargetPicker
                prompt="Select Detective's target:"
                candidates={roleHolders.map(p => p.name)}
                onPick={name => logNightAction('DETECTIVE', 'INVESTIGATE', name)}
              />
            )}
          </View>

          <Pressable
            style={[styles.primary, (!outlawAction || !doctorAction || !detectiveAction) && styles.buttonDisabled]}
            disabled={!outlawAction || !doctorAction || !detectiveAction}
            onPress={() => dispatch({ type: 'NIGHT_RESOLVED' })}
          >
            <Text style={styles.primaryText}>Resolve Night</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => dispatch({ type: 'PHASE_ADVANCED', to: 'ROLE_ASSIGNMENT' })}>
            <Text style={styles.secondaryText}>Back — re-show the Roles QR (someone missed the scan)</Text>
          </Pressable>
        </View>
      )}

      {phase === 'DAY_NARRATION' && (
        <>
          <Text style={styles.stepGuide}>1. Announce "Morning has broken" and read the card aloud:</Text>
          <AathichoodiCard
            category={lastOutcome?.victim ? 'DAY_START_LOSS' : 'DAY_START_PEACE'}
            victimName={lastOutcome?.victim}
          />
          <View style={styles.qrCard}>
            <Text style={styles.stepGuide}>2. Show this Sync QR — wait until every player has scanned it (their one scan for the whole day):</Text>
            <View style={styles.qrWrap}><QRCode value={syncQR!} size={150} /></View>
            <DevPayloadText payload={syncQR!} />
          </View>
          <Text style={styles.stepGuide}>3. When everyone has synced, open the floor:</Text>
          <Pressable style={styles.primary} onPress={() => dispatch({ type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' })}>
            <Text style={styles.primaryText}>Open nominations</Text>
          </Pressable>
        </>
      )}

      {phase === 'DAY_NOMINATION' && (
        <>
          <Text style={styles.stepGuide}>1. Read the card aloud, then let the room debate and nominate — all out loud, no phones needed:</Text>
          <AathichoodiCard category="NOMINATION_TENSION" />
          <View style={styles.qrCard}>
            <Text style={styles.stepGuide}>Latecomer missed the morning scan? The Sync QR is still here:</Text>
            <View style={styles.qrWrap}><QRCode value={syncQR!} size={130} /></View>
            <DevPayloadText payload={syncQR!} />
          </View>
          <Text style={styles.stepGuide}>2. When the room settles on suspects, call the vote:</Text>
          <Pressable style={styles.primary} onPress={() => dispatch({ type: 'PHASE_ADVANCED', to: 'DAY_VOTE' })}>
            <Text style={styles.primaryText}>Move to the vote</Text>
          </Pressable>
        </>
      )}

      {/* Secret Ballot Scanning & Vote Tally */}
      {phase === 'DAY_VOTE' && (
        <>
          <AathichoodiCard category="EXECUTION_RESOLVED" victimName={lastElimination} />

          <Text style={styles.stepGuide}>1. Walk the circle and scan each alive player's ballot QR:</Text>
          <Pressable style={[styles.primary, { marginBottom: 16 }]} onPress={() => setActiveScanner('ballot')}>
            <Text style={styles.primaryText}>Scan Player Ballot QR ({voteList.length}/{roleHolders.length})</Text>
          </Pressable>

          <View style={styles.tallyCard}>
            <Text style={styles.sectionTitle}>Live Ballot Tally:</Text>
            {voteCounts.map(([name, count]) => (
              <Text key={name} style={styles.tallyRow}>{name}: {count} {count === 1 ? 'vote' : 'votes'}</Text>
            ))}
          </View>

          <Text style={styles.stepGuide}>2. Announce the result and confirm the banishment:</Text>
          <TargetPicker
            prompt="Confirm who the town votes out:"
            candidates={roleHolders.map(p => p.name)}
            onPick={name => dispatch({ type: 'PLAYER_ELIMINATED', name })}
          />

          <Text style={styles.stepGuide}>3. Read the card's verdict aloud, then close the day:</Text>
          {winner ? (
            <View style={styles.winBox}>
              <Text style={[styles.winBanner, { color: winColor }]}>
                🏆 {winner === 'TOWN' ? 'TOWN WINS' : 'OUTLAWS WIN'}
              </Text>
              <Pressable
                style={[styles.primary, styles.winButton, { borderColor: winColor }]}
                onPress={() => dispatch({ type: 'ROUND_ENDED' })}
              >
                <Text style={styles.primaryText}>{winner} win — end the round</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.primary, !lastElimination && styles.buttonDisabled]}
              onPress={() => {
                const advance = () => dispatch({ type: 'PHASE_ADVANCED', to: 'NIGHT' });
                if (lastElimination) {
                  advance();
                } else {
                  // A no-elimination day is a legitimate outcome (tied vote, town
                  // declines) — allowed, but never by accident.
                  Alert.alert(
                    'No one was voted out',
                    'Proceed to night without a banishment?',
                    [{ text: 'Stay in the vote', style: 'cancel' }, { text: 'Night falls', onPress: advance }]
                  );
                }
              }}
            >
              <Text style={styles.primaryText}>Night falls again</Text>
            </Pressable>
          )}
        </>
      )}

      {phase === 'ROUND_OVER' && (
        <>
          <AathichoodiCard category="GAME_OVER" />
          {suggestedNext && (
            <Text style={styles.dim}>Suggested next Moderator: {suggestedNext}</Text>
          )}
          <View style={styles.rosterCard}>
            <Text style={styles.sectionTitle}>Next round's roster (remove anyone who left):</Text>
            {(roster ?? []).filter(p => !p.isModerator).map(p => (
              <View key={p.name} style={styles.rosterLine}>
                <Text style={styles.rosterRow}>{p.name}</Text>
                <Pressable onPress={() => confirmRemove(p.name)}>
                  <Text style={styles.removeText}>remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
          {showHandoff ? (
            <View style={styles.qrCard}>
              <Text style={styles.sectionTitle}>Next Moderator: scan to take over</Text>
              <View style={styles.qrWrap}><QRCode value={handoffQR!} size={190} /></View>
              <DevPayloadText payload={handoffQR!} />
            </View>
          ) : (
            <Pressable style={styles.primary} onPress={() => setShowHandoff(true)}>
              <Text style={styles.primaryText}>Hand off Moderator (show QR)</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondary} onPress={() => setActiveScanner('stepDownRoles')}>
            <Text style={styles.secondaryText}>Handed off — join the next round as a player</Text>
          </Pressable>
          <Pressable style={styles.danger} onPress={() => dispatch({ type: 'GAME_NIGHT_CLEARED' })}>
            <Text style={styles.dangerText}>New Game Night (wipe this session)</Text>
          </Pressable>
        </>
      )}

      {phase !== 'LOBBY' && phase !== 'ROUND_OVER' && roster && (
        <View style={styles.rosterCard}>
          <Text style={styles.sectionTitle}>Players Status:</Text>
          {/* Roles are secret: players stand right here to scan the sync QR, so the
              resting state must leak nothing. Statuses are public once announced. */}
          {roster.map(p => (
            <Text key={p.name} style={[styles.rosterRow, p.status !== 'ACTIVE' && styles.deceasedRow]}>
              {p.name}{revealRoles && !p.isModerator ? ` — ${p.role}` : ''} [{p.status}]
            </Text>
          ))}
          <Pressable
            onPressIn={() => setRevealRoles(true)}
            onPressOut={() => setRevealRoles(false)}
            style={styles.revealRoles}
          >
            <Text style={styles.revealRolesText}>
              {revealRoles ? 'Roles visible — release to hide' : 'Hold to reveal roles (peek privately)'}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.primaryDark },
  container: { flexGrow: 1, backgroundColor: colors.primaryDark, padding: 24 },
  header: { alignItems: 'center', marginBottom: 20 },
  headerIcon: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: 'bold' },
  badge: { color: colors.brandGold, fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  hint: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginBottom: 12, textAlign: 'center' },
  dim: { color: colors.textDim, textAlign: 'center', marginVertical: 14 },
  stepGuide: { color: colors.brandGold, fontSize: 13, marginTop: 16, marginBottom: 6, lineHeight: 18 },
  qrCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  qrWrap: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 8 },
  rosterCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    marginTop: 12,
  },
  rosterRow: { color: colors.text, fontSize: 14, paddingVertical: 4 },
  rosterLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeText: { color: colors.roleOutlaw, fontSize: 12, textDecorationLine: 'underline', padding: 4 },
  revealRoles: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  revealRolesText: { color: colors.textDim, fontSize: 12 },
  deceasedRow: { color: colors.roleOutlaw, textDecorationLine: 'line-through' },
  consoleCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  pickerBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  pickerLabel: { color: colors.text, fontWeight: 'bold', fontSize: 14, marginBottom: 8 },
  tallyCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  tallyRow: { color: colors.text, fontSize: 15, paddingVertical: 2, fontWeight: 'bold' },
  primary: { backgroundColor: colors.brandGold, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 12 },
  primaryText: { color: colors.primaryDark, fontWeight: 'bold', fontSize: 16 },
  winBox: { marginTop: 12 },
  winBanner: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, letterSpacing: 1 },
  winButton: { marginTop: 0, borderWidth: 3 },
  secondary: { borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 12 },
  secondaryText: { color: colors.text, fontWeight: 'bold' },
  danger: { borderColor: colors.roleOutlaw, borderWidth: 1, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 16 },
  dangerText: { color: colors.roleOutlaw, fontWeight: 'bold' },
  buttonDisabled: { opacity: 0.3 },
  button: { backgroundColor: colors.cardBackground, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: colors.text, fontWeight: 'bold' },
});
