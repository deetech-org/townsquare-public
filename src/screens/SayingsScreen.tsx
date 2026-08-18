import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { BrandMark } from '../components/BrandMark';
import { NarrationCategory, NarrationEngine, TamilSaying } from '../services/NarrationEngine';

interface Props {
  onClose: () => void;
}

const CATEGORY_TITLES: Record<NarrationCategory, string> = {
  LOBBY_WELCOME: '1. Lobby & Welcome',
  DAY_START_PEACE: '2. Safe Morning (Doctor Guard)',
  DAY_START_LOSS: '3. Morning Loss (Outlaw Strike)',
  NOMINATION_TENSION: '4. Nominations & Debate',
  EXECUTION_RESOLVED: '5. Vote & Banishment',
  GAME_OVER: '6. Game Conclusion',
};

const CATEGORY_ORDER: NarrationCategory[] = [
  'LOBBY_WELCOME',
  'DAY_START_PEACE',
  'DAY_START_LOSS',
  'NOMINATION_TENSION',
  'EXECUTION_RESOLVED',
  'GAME_OVER',
];

/**
 * Browsable reference screen of all 50 curated Tamil moral aphorisms
 * from Avvaiyar (Aathichoodi, Konrai Vendhan) and Bharathiyar (Puthia Aathichoodi).
 */
export function SayingsScreen({ onClose }: Props) {
  const allSayings = NarrationEngine.allByCategory();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <BrandMark size={56} style={styles.heroMark} />
        <Text style={styles.title}>Tamil Moral Wisdom</Text>
        <Text style={styles.subtitle}>
          50 classical and modern moral aphorisms from Avvaiyar & Bharathiyar, guiding every phase of Townsquare.
        </Text>

        {CATEGORY_ORDER.map(cat => {
          const list = allSayings[cat] ?? [];
          return (
            <View key={cat} style={styles.section}>
              <Text style={styles.sectionTitle}>{CATEGORY_TITLES[cat]} ({list.length} sayings)</Text>
              {list.map((saying, idx) => {
                const poet = NarrationEngine.poetFor(saying);
                return (
                  <View key={idx} style={[styles.sayingItem, idx > 0 && styles.sayingBorder]}>
                    <Text style={styles.eyebrow}>{saying.source.toUpperCase()} · {poet.toUpperCase()}</Text>
                    <Text style={styles.tamilText}>{saying.tamil}</Text>
                    <Text style={styles.transliteration}>{saying.transliteration}</Text>
                    <Text style={styles.translation}>{saying.translation}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Back to Game</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark },
  scroll: { padding: 24, paddingBottom: 48 },
  heroMark: { alignSelf: 'center', marginBottom: 12 },
  title: { color: colors.brandGold, fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  section: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { color: colors.brandGold, fontSize: 16, fontWeight: 'bold', marginBottom: 14 },
  sayingItem: { paddingVertical: 10 },
  sayingBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)' },
  eyebrow: { color: colors.brandGold, fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 4 },
  tamilText: { color: colors.text, fontSize: 19, fontWeight: 'bold', lineHeight: 26, marginBottom: 2 },
  transliteration: { color: colors.textDim, fontSize: 13, fontStyle: 'italic', marginBottom: 2 },
  translation: { color: colors.text, fontSize: 14, lineHeight: 19 },
  closeButton: {
    backgroundColor: colors.brandGold,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  closeButtonText: { color: colors.primaryDark, fontWeight: 'bold', fontSize: 16 },
});
