import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  prompt: string;
  candidates: string[];
  onPick: (name: string) => void;
}

/** Night-action target chooser: one tap per candidate, no free-text entry anywhere. */
export function TargetPicker({ prompt, candidates, onPick }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.prompt}>{prompt}</Text>
      {candidates.map(name => (
        <Pressable key={name} style={styles.option} onPress={() => onPick(name)}>
          <Text style={styles.optionText}>{name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  prompt: { color: colors.text, fontSize: 16, marginBottom: 14 },
  option: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  optionText: { color: colors.text, textAlign: 'center', fontSize: 15 },
});
