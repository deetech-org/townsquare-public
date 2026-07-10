import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TownsquareRole } from '../types';
import { colors, roleColor } from '../theme';
import { BRAND_MARK } from './BrandMark';

interface Props {
  role: TownsquareRole;
  companions?: string[];
}

/**
 * Hold-to-Reveal (spec §10.3): the role shows only while the thumb is held down,
 * so a glance from a neighbor in the room sees a blank card.
 */
export function RoleRevealCard({ role, companions }: Props) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Pressable
      onPressIn={() => setRevealed(true)}
      onPressOut={() => setRevealed(false)}
      style={[styles.card, revealed && { borderColor: roleColor[role] }]}
    >
      {revealed ? (
        <View style={styles.center}>
          <Text style={styles.label}>You are</Text>
          <Text style={[styles.role, { color: roleColor[role] }]}>{role}</Text>
          {role === 'OUTLAW' && companions && companions.length > 0 && (
            <Text style={styles.companions}>Fellow outlaws: {companions.join(', ')}</Text>
          )}
        </View>
      ) : (
        <View style={styles.center}>
          <Image
            source={BRAND_MARK}
            style={styles.cardBackIcon}
            resizeMode="contain"
          />
          <Text style={styles.hint}>Hold to reveal your role</Text>
          <Text style={styles.subHint}>Release to hide it again</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    minHeight: 180,
    justifyContent: 'center',
  },
  center: { alignItems: 'center' },
  cardBackIcon: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  label: { color: colors.textDim, fontSize: 14 },
  role: { fontSize: 36, fontWeight: 'bold', marginTop: 8 },
  companions: { color: colors.textDim, marginTop: 12, textAlign: 'center' },
  hint: { color: colors.text, fontSize: 18 },
  subHint: { color: colors.textDim, fontSize: 13, marginTop: 6 },
});
