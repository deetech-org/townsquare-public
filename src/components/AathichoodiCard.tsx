import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NarrationCategory, NarrationEngine } from '../services/NarrationEngine';
import { BRAND_MARK } from './BrandMark';
import { colors } from '../theme';

interface Props {
  category: NarrationCategory;
  victimName?: string;
}

/**
 * Tamil Narration Card (spec §10.3): gold-framed saying with a translation toggle
 * and the read-out-loud narrator script for whoever is Moderator this round.
 */
export function AathichoodiCard({ category, victimName }: Props) {
  const saying = useMemo(() => NarrationEngine.pickSaying(category), [category]);
  const [showTranslation, setShowTranslation] = useState(false);

  if (!saying) return null;
  const script = NarrationEngine.scriptFor(category, victimName);
  const poet = NarrationEngine.poetFor(saying);

  return (
    <View style={styles.card}>
      <Image
        source={BRAND_MARK}
        style={styles.watermark}
        resizeMode="contain"
      />
      <Text style={styles.source}>{saying.source.toUpperCase()}</Text>
      <Text style={styles.tamil}>{saying.tamil}</Text>
      <Text style={styles.transliteration}>{saying.transliteration}</Text>

      <Pressable onPress={() => setShowTranslation(v => !v)} style={styles.toggle}>
        <Text style={styles.toggleText}>{showTranslation ? 'Hide Translation' : 'Show Translation'}</Text>
      </Pressable>
      {showTranslation && (
        <>
          <Text style={styles.translation}>"{saying.translation}"</Text>
          <Text style={styles.meaning}>{saying.contextMeaning}</Text>
        </>
      )}

      <Text style={styles.scriptLabel}>Read out loud:</Text>
      <Text style={styles.script}>
        "Gather round, townsfolk. {poet} reminds us today: '{saying.tamil}' — '{saying.translation}'. {script} Discuss."
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.brandGold,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden', // clips watermark
  },
  watermark: {
    position: 'absolute',
    opacity: 0.04,
    width: 250,
    height: 250,
    alignSelf: 'center',
    top: '30%',
  },
  source: { color: colors.brandGold, fontSize: 11, letterSpacing: 2 },
  tamil: { color: colors.text, fontSize: 26, marginTop: 10, lineHeight: 38 },
  transliteration: { color: colors.textDim, fontStyle: 'italic', marginTop: 4 },
  toggle: { marginTop: 12 },
  toggleText: { color: colors.brandGold, fontSize: 13 },
  translation: { color: colors.text, marginTop: 8 },
  meaning: { color: colors.textDim, marginTop: 4, fontSize: 13 },
  scriptLabel: { color: colors.textDim, fontSize: 11, marginTop: 16, letterSpacing: 1 },
  script: { color: colors.text, marginTop: 6, lineHeight: 20 },
});
