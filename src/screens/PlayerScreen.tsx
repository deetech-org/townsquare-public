import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSession } from '../state/SessionContext';
import { RoleRevealCard } from '../components/RoleRevealCard';
import { TargetPicker } from '../components/TargetPicker';
import { QRScannerView } from '../components/QRScannerView';
import { DevPayloadText } from '../components/DevPayloadText';
import { QRCodec } from '../services/QRCodec';
import { scanRolesPayload } from '../services/rolesScan';
import { colors } from '../theme';
import { BrandMark, BRAND_MARK } from '../components/BrandMark';

interface Props {
  onScanJoin: () => void;
  onScanHandoff: () => void;
}

export function PlayerScreen({ onScanJoin, onScanHandoff }: Props) {
  const { state, dispatch } = useSession();
  const session = state.session;
  const [activeScanner, setActiveScanner] = useState<'roles' | 'sync' | null>(null);
  const [selectedBallotTarget, setSelectedBallotTarget] = useState<string | null>(null);
  const [peekBallot, setPeekBallot] = useState(false);

  if (!session) return null;
  const { self, sessionId, companions, phase, roster } = session;

  const handleRolesScanned = async (data: string) => {
    const result = await scanRolesPayload(data, session, dispatch);
    Alert.alert(result.title, result.message);
    setActiveScanner(null);
  };

  const handleSyncScanned = (data: string) => {
    const payload = QRCodec.decode(data);
    if (!payload || payload.kind !== 'sync') {
      Alert.alert('Error', 'Invalid QR code. Please scan the Moderator\'s Sync QR.');
      setActiveScanner(null);
      return;
    }
    dispatch({ type: 'STATE_SYNC_SCANNED', payload });
    // Reset ballot choice if sync transitions us to a new round or resets phase
    if (payload.phase !== 'DAY_VOTE') {
      setSelectedBallotTarget(null);
    }
    setActiveScanner(null);
  };

  // 1. Not joined any session yet
  if (!sessionId) {
    return (
      <View style={styles.container}>
        <BrandMark size={64} style={styles.heroMark} />
        <Text style={styles.title}>Hi {self.name}</Text>
        <Text style={styles.hint}>Start a game night as Moderator, or join one by scanning the Moderator's QR code.</Text>
        <Pressable style={styles.button} onPress={() => dispatch({ type: 'SESSION_CREATED' })}>
          <Text style={styles.buttonText}>Create Game Night (become Moderator)</Text>
        </Pressable>
        <Pressable style={styles.buttonAlt} onPress={onScanJoin}>
          <Text style={styles.buttonAltText}>Join a Game (scan QR)</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => dispatch({ type: 'PROFILE_CLEARED' })}>
          <Text style={styles.linkText}>Change name</Text>
        </Pressable>
      </View>
    );
  }

  // Camera views
  if (activeScanner === 'roles') {
    return (
      <QRScannerView
        title="Scan Moderator's Roles QR"
        onScanned={handleRolesScanned}
        onCancel={() => setActiveScanner(null)}
      />
    );
  }

  if (activeScanner === 'sync') {
    return (
      <QRScannerView
        title="Scan Moderator's Sync QR"
        onScanned={handleSyncScanned}
        onCancel={() => setActiveScanner(null)}
      />
    );
  }

  const isDead = self.status === 'DECEASED' || self.status === 'ELIMINATED';
  // One scan per day cycle: the morning sync delivers the only new digital fact
  // (who died), so it unlocks voting for the whole day. "The vote is called" is
  // verbal-native — no second sync just to flip a phase flag.
  const isDay = phase === 'DAY_NARRATION' || phase === 'DAY_NOMINATION' || phase === 'DAY_VOTE';
  const aliveCandidates = (roster ?? [])
    .filter(p => p.status === 'ACTIVE' && !p.isModerator && p.name !== self.name)
    .map(p => p.name);

  const ballotQR = selectedBallotTarget
    ? QRCodec.encode({
        kind: 'ballot',
        sid: sessionId,
        roundNumber: session.roundNumber,
        voter: self.name,
        target: selectedBallotTarget,
      })
    : null;

  // 2. Joined session, but role is still unassigned (Lobby state)
  if (self.role === 'UNASSIGNED') {
    const joinAckQR = QRCodec.encode({
      kind: 'joinAck',
      sid: sessionId,
      name: self.name,
    });

    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text style={styles.title}>Lobby Onboarding</Text>
        <Text style={styles.hint}>Show this QR code to the Moderator to complete your registration:</Text>

        <View style={styles.qrCard}>
          <View style={styles.qrWrap}>
            <QRCode value={joinAckQR} size={180} />
          </View>
          <Text style={styles.qrText}>Name: {self.name}</Text>
          <DevPayloadText payload={joinAckQR} />
        </View>

        <Pressable style={styles.button} onPress={() => setActiveScanner('roles')}>
          <Text style={styles.buttonText}>Scan Roles QR (when started)</Text>
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() =>
            Alert.alert('Leave this game night?', 'Tell the Moderator you are leaving — your seat stays in their roster.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave game night', style: 'destructive', onPress: () => dispatch({ type: 'SESSION_LEFT' }) },
            ])
          }
        >
          <Text style={styles.leaveText}>Leave game night</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // 3. Gameplay view (Active, Deceased, or Eliminated)
  if (phase === 'NIGHT' && !isDead) {
    return (
      <View style={styles.nightContainer}>
        <Image
          source={BRAND_MARK}
          style={styles.nightIcon}
          resizeMode="contain"
        />
        <Text style={styles.nightTitle}>Night Has Fallen</Text>
        <Text style={styles.nightSubtitle}>Close your eyes and listen to the Moderator.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Round {session.roundNumber}</Text>

      {isDead ? (
        <View style={styles.deadCard}>
          <BrandMark size={56} rounded={false} style={styles.deadMark} />
          <Text style={styles.deadTitle}>You are {self.status}</Text>
          <Text style={styles.deadText}>You can no longer vote, act, or speak. Please remain silent.</Text>
        </View>
      ) : (
        <RoleRevealCard role={self.role} companions={companions} />
      )}

      {/* Secret Ballot Voting */}
      {!isDead && isDay && (
        <View style={styles.section}>
          {selectedBallotTarget ? (
            <View style={styles.qrCard}>
              {/* The choice lives only inside the QR: the Moderator (and anyone queueing
                  behind) reads this screen while scanning — it must not name the target. */}
              <Text style={styles.qrText}>Your secret ballot is ready</Text>
              <Text style={styles.hint}>Show this QR to the Moderator to cast it. Your choice is only inside the code.</Text>
              <View style={styles.qrWrap}>
                <QRCode value={ballotQR!} size={150} />
              </View>
              <DevPayloadText payload={ballotQR!} />
              <Pressable
                onPressIn={() => setPeekBallot(true)}
                onPressOut={() => setPeekBallot(false)}
                style={styles.peekBallot}
              >
                <Text style={styles.peekBallotText}>
                  {peekBallot ? `Voting for: ${selectedBallotTarget}` : 'Hold to check your choice'}
                </Text>
              </Pressable>
              <Pressable style={styles.buttonAlt} onPress={() => setSelectedBallotTarget(null)}>
                <Text style={styles.buttonAltText}>Change Vote</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.voteBox}>
              {aliveCandidates.length > 0 ? (
                <TargetPicker
                  prompt="Cast your secret ballot — select a suspect:"
                  candidates={aliveCandidates}
                  onPick={setSelectedBallotTarget}
                />
              ) : (
                <Text style={styles.hint}>Scan the Sync QR first to refresh active candidates.</Text>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.buttonGroup}>
        <Pressable style={styles.button} onPress={() => setActiveScanner('sync')}>
          <Text style={styles.buttonText}>Scan Sync QR (State Sync)</Text>
        </Pressable>

        {/* Run-02 Finding 1: without this, a player still in the round-1 gameplay view
            has no way to receive the next round's roles after a moderator handoff. */}
        <Pressable style={styles.buttonAlt} onPress={() => setActiveScanner('roles')}>
          <Text style={styles.buttonAltText}>Scan Roles QR (new round)</Text>
        </Pressable>

        <Pressable style={styles.linkButton} onPress={onScanHandoff}>
          <Text style={styles.linkText}>I'm the next Moderator — scan handoff QR</Text>
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() =>
            Alert.alert('Leave this game night?', 'Tell the Moderator you are leaving — your seat stays in their roster.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave game night', style: 'destructive', onPress: () => dispatch({ type: 'SESSION_LEFT' }) },
            ])
          }
        >
          <Text style={styles.leaveText}>Leave game night</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.primaryDark },
  container: { flexGrow: 1, backgroundColor: colors.primaryDark, padding: 24, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  hint: { color: colors.textDim, textAlign: 'center', marginTop: 10, marginBottom: 16, lineHeight: 20 },
  qrCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  qrWrap: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 8, marginBottom: 12 },
  qrText: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginTop: 8 },
  deadCard: {
    backgroundColor: 'rgba(255, 75, 92, 0.08)',
    borderColor: colors.roleOutlaw,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  deadTitle: { color: colors.roleOutlaw, fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  deadText: { color: colors.text, textAlign: 'center', lineHeight: 20 },
  section: { marginTop: 20 },
  voteBox: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  buttonGroup: { marginTop: 24 },
  button: { backgroundColor: colors.brandGold, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 12 },
  buttonText: { color: colors.primaryDark, fontWeight: 'bold', fontSize: 16 },
  buttonAlt: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
  },
  buttonAltText: { color: colors.text, fontWeight: 'bold' },
  peekBallot: {
    marginTop: 4,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  peekBallotText: { color: colors.textDim, fontSize: 12 },
  linkButton: { marginTop: 20, alignItems: 'center' },
  linkText: { color: colors.textDim, fontSize: 13, textDecorationLine: 'underline' },
  leaveText: { color: colors.roleOutlaw, fontSize: 13, textDecorationLine: 'underline' },
  heroMark: { alignSelf: 'center', marginBottom: 16 },
  deadMark: { alignSelf: 'center', opacity: 0.35, marginBottom: 12 },
  nightContainer: {
    flex: 1,
    backgroundColor: '#000000', // pure black to reduce light bleed
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  nightIcon: {
    width: 180,
    height: 180,
    opacity: 0.12, // dimmed screensaver
    marginBottom: 32,
  },
  nightTitle: {
    color: '#8A99AD',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  nightSubtitle: {
    color: '#4B5563',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
