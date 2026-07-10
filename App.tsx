import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from './src/state/SessionContext';
import { QRCodec } from './src/services/QRCodec';
import { SetupScreen } from './src/screens/SetupScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { ModeratorScreen } from './src/screens/ModeratorScreen';
import { HowToPlayScreen } from './src/screens/HowToPlayScreen';
import { QRScannerView } from './src/components/QRScannerView';
import { BrandMark } from './src/components/BrandMark';
import { colors } from './src/theme';

type ScanMode = 'none' | 'join' | 'handoff';

function AppShell() {
  const { state, dispatch, hydrated } = useSession();
  const [scanMode, setScanMode] = useState<ScanMode>('none');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (state.alert) {
      Alert.alert('Townsquare', state.alert, [
        { text: 'OK', onPress: () => dispatch({ type: 'ALERT_CLEARED' }) },
      ]);
    }
  }, [state.alert, dispatch]);

  const onScanned = (data: string) => {
    const payload = QRCodec.decode(data);
    const expected = scanMode;
    setScanMode('none');
    if (!payload || payload.kind !== expected) {
      Alert.alert('Townsquare', 'That is not the QR code this step expects.');
      return;
    }
    if (payload.kind === 'join') dispatch({ type: 'JOIN_SCANNED', payload });
    else dispatch({ type: 'HANDOFF_SCANNED', payload });
  };

  if (!hydrated) {
    return (
      <View style={styles.splash}>
        <BrandMark size={120} style={{ marginBottom: 20 }} />
        <Text style={styles.splashText}>Townsquare</Text>
      </View>
    );
  }

  if (showHelp) {
    return <HowToPlayScreen onClose={() => setShowHelp(false)} />;
  }

  if (scanMode !== 'none') {
    return (
      <QRScannerView
        title={scanMode === 'join' ? "Scan the Moderator's join QR" : "Scan the outgoing Moderator's handoff QR"}
        onScanned={onScanned}
        onCancel={() => setScanMode('none')}
      />
    );
  }

  const screen = !state.session
    ? <SetupScreen />
    : state.session.deviceMode === 'MODERATOR'
      ? <ModeratorScreen />
      : (
        <PlayerScreen
          onScanJoin={() => setScanMode('join')}
          onScanHandoff={() => setScanMode('handoff')}
        />
      );

  return (
    <View style={styles.shell}>
      {screen}
      <Pressable
        style={styles.helpFab}
        onPress={() => setShowHelp(true)}
        accessibilityLabel="How to play"
      >
        <Text style={styles.helpFabText}>?</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        {/* iPhone field finding: content was hidden behind the notch/Dynamic Island
            and the home indicator. One SafeAreaView here insets every screen. */}
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <AppShell />
        </SafeAreaView>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primaryDark },
  blank: { flex: 1, backgroundColor: colors.primaryDark },
  splash: { flex: 1, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  splashText: { color: colors.brandGold, fontSize: 30, fontWeight: 'bold', letterSpacing: 1 },
  shell: { flex: 1, backgroundColor: colors.primaryDark },
  helpFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardBackground,
    borderColor: colors.brandGold,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    // Deliberately absent from the scanner views: nothing should overlap the viewfinder.
  },
  helpFabText: { color: colors.brandGold, fontSize: 20, fontWeight: 'bold' },
});
