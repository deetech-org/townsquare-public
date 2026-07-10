import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { BrandMark } from '../components/BrandMark';

interface Props {
  onClose: () => void;
}

const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <Text style={styles.body}>{children}</Text>
);

/**
 * In-app Player Guide — the how-to-play.md player guide, always at hand.
 * Static content by design: it must work offline like everything else.
 */
export function HowToPlayScreen({ onClose }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <BrandMark size={56} style={styles.heroMark} />
        <Text style={styles.title}>How to Play</Text>
        <Text style={styles.subtitle}>
          Townsquare needs no internet or signal — the game travels between phones as QR codes and silent gestures.
        </Text>

        <S title="Objective">
          <P>• Outlaws win when they equal or outnumber the remaining Townspeople.</P>
          <P>• Townspeople (Detective, Doctor, Town) win by voting out every Outlaw.</P>
          <P>• Room size: 6-16 players plus one Moderator (7-17 people). The Moderator holds no role and rotates every round, so everyone gets to play.</P>
        </S>

        <S title="1. Join the lobby">
          <P>The Moderator taps Create Game Night and shows the Join QR. Each player scans it, then shows their own joinAck QR back for the Moderator to scan. Your name is the only personal detail the app ever holds.</P>
        </S>

        <S title="2. Get your role">
          <P>The Moderator shows one Roles QR. Scan it — your device reveals only your own role. Press and hold the blank card to peek; release to hide. Outlaws also see their fellow Outlaws.</P>
        </S>

        <S title="3. The silent night">
          <P>Everyone closes their eyes. The Moderator calls each role in turn — Outlaws point at a target, the Doctor points at a save, the Detective points at a suspect and gets a silent nod (guilty) or shake (innocent). No phones are used; the Moderator logs the choices on their own console and taps Resolve Night.</P>
        </S>

        <S title="4. Morning">
          <P>The Moderator reads the Tamil narration aloud — it names the victim, or celebrates the Doctor's save. Scan the Sync QR to update who is alive. If you died: your screen turns crimson, and you stay silent (and smug) for the rest of the round.</P>
        </S>

        <S title="5. Discuss, nominate, vote">
          <P>Accusations and defenses happen out loud. Your morning sync already unlocked voting — pick your suspect and show your secret ballot QR to the Moderator when the vote is called. The tally is live on the Moderator's console; the most-voted player is banished. Then night falls again — or the round ends.</P>
        </S>

        <S title="6. Next round — new Moderator">
          <P>At round end the app suggests the next Moderator (whoever has moderated least). They scan the Handoff QR from the outgoing Moderator via "I'm the next Moderator", then show a fresh Roles QR. Everyone scans it with "Scan Roles QR (new round)" — and the outgoing Moderator joins in via "Handed off — join the next round as a player". Roles rotate fairly, so newcomers get the special roles first.</P>
          <P>⚠️ "New Game Night" wipes the whole session — roster, history, everything. Only use it when the group is done for the evening.</P>
        </S>

        <S title="If a scan won't work">
          <P>• Turn the displaying phone's brightness up; hold phones 15-30 cm apart; avoid glare.</P>
          <P>• "Not registered in this round": you joined after the round started — join fresh next round.</P>
          <P>• "Failed to decrypt": your name doesn't match the roster the roles were dealt to — rejoin with the same name, then the Moderator restarts the round.</P>
          <P>• No working camera at all: the Moderator's console shows every role — they can quietly tell or show you yours, just like a physical game.</P>
        </S>
      </ScrollView>

      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>Back to the game</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark },
  scroll: { padding: 24, paddingBottom: 24 },
  heroMark: { alignSelf: 'center', marginBottom: 10 },
  title: { color: colors.brandGold, fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: colors.textDim, textAlign: 'center', marginTop: 8, marginBottom: 12, lineHeight: 20 },
  section: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  sectionTitle: { color: colors.brandGold, fontSize: 15, fontWeight: 'bold', marginBottom: 8 },
  body: { color: colors.text, lineHeight: 21, marginBottom: 6 },
  closeButton: {
    backgroundColor: colors.brandGold,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    margin: 16,
  },
  closeText: { color: colors.primaryDark, fontWeight: 'bold', fontSize: 16 },
});
