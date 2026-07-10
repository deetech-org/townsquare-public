import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../theme';

interface Props {
  title: string;
  onScanned: (data: string) => void;
  onCancel: () => void;
}

/**
 * DEV builds only: a paste box feeding the same onScanned handler the camera uses,
 * so emulators (no webcam on the dev PC) can receive payloads via the host-shared
 * clipboard from DevPayloadText. Compiled out of release builds — production stays
 * camera-only per spec §6. Rendered even when camera permission is missing, so an
 * emulator without a camera can still complete every flow.
 */
function DevPasteBox({ onScanned }: { onScanned: (data: string) => void }) {
  const [pasted, setPasted] = useState('');
  if (!__DEV__) return null;

  const submit = () => {
    if (pasted.trim()) onScanned(pasted.trim());
  };

  return (
    <View style={styles.devBox}>
      <Text style={styles.devLabel}>DEV: paste a payload instead of scanning</Text>
      {/* Single-line on purpose: payloads are one-line JSON, and a single-line input
          lets the keyboard's Go key (and adb `input keyevent 66`) submit directly —
          no coordinate taps needed under automation. */}
      <TextInput
        style={styles.devInput}
        placeholder="Paste QR payload text here"
        placeholderTextColor={colors.textDim}
        value={pasted}
        onChangeText={setPasted}
        returnKeyType="go"
        onSubmitEditing={submit}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        style={[styles.devButton, !pasted.trim() && styles.devButtonDisabled]}
        disabled={!pasted.trim()}
        onPress={submit}
      >
        <Text style={styles.devButtonText}>Use pasted payload</Text>
      </Pressable>
    </View>
  );
}

/** Full-screen QR scanner — the single entry point for every scanned payload. */
export function QRScannerView({ title, onScanned, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const consumed = useRef(false); // CameraView fires repeatedly; deliver the first hit once

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>Camera access is needed to scan the QR code.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant camera access</Text>
        </Pressable>
        <DevPasteBox onScanned={onScanned} />
        <Pressable style={styles.cancel} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (consumed.current) return;
          consumed.current = true;
          onScanned(data);
        }}
      />
      <DevPasteBox onScanned={onScanned} />
      <Pressable style={styles.cancel} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark, padding: 20, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 18, textAlign: 'center', marginBottom: 16 },
  hint: { color: colors.textDim, textAlign: 'center', marginBottom: 16 },
  camera: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  button: { backgroundColor: colors.cardBackground, borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: colors.text },
  cancel: { marginTop: 16, alignItems: 'center' },
  cancelText: { color: colors.textDim },
  devBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  devLabel: { color: colors.textDim, fontSize: 11, marginBottom: 6 },
  devInput: {
    color: colors.text,
    fontSize: 11,
    fontFamily: 'monospace',
    backgroundColor: colors.primaryDark,
    borderRadius: 6,
    padding: 8,
    minHeight: 44,
  },
  devButton: { backgroundColor: colors.primaryDark, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: colors.border },
  devButtonDisabled: { opacity: 0.35 },
  devButtonText: { color: colors.text, fontSize: 13 },
});
