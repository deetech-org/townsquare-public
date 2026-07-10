import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useSession } from '../state/SessionContext';
import { BrandMark } from '../components/BrandMark';
import { colors } from '../theme';

/**
 * First run: each player enters their name (v3.1 — names are the only personal data
 * the app ever holds).
 */
export function SetupScreen() {
  const { dispatch } = useSession();
  const [name, setName] = useState('');
  const valid = name.trim().length > 0;

  const handleContinue = () => {
    if (!valid) return;
    dispatch({ type: 'PROFILE_CREATED', name: name.trim() });
  };

  return (
    // iPhone field finding: iOS does not resize the view for the keyboard the way
    // Android does — without this, the Continue button hides behind the keyboard.
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BrandMark size={88} style={styles.heroMark} />
      <Text style={styles.title}>Townsquare</Text>
      <Text style={styles.subtitle}>Enter your name — it stays on this phone and is only shared with your game's Moderator.</Text>

      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor={colors.textDim}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
      <Pressable
        style={[styles.button, !valid && styles.buttonDisabled]}
        disabled={!valid}
        onPress={handleContinue}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark, padding: 24, justifyContent: 'center' },
  heroMark: { alignSelf: 'center', marginBottom: 16 },
  title: { color: colors.brandGold, fontSize: 34, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: colors.textDim, textAlign: 'center', marginTop: 10, marginBottom: 28, lineHeight: 20 },
  input: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    padding: 14,
    marginBottom: 12,
  },
  button: { backgroundColor: colors.brandGold, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: colors.primaryDark, fontWeight: 'bold', fontSize: 16 },
});
