import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

/**
 * DEV builds only: shows the raw wire string behind a displayed QR so it can be
 * long-press-copied and pasted into another instance's scanner (QRScannerView's
 * dev paste box). Lets emulators exchange payloads over the shared clipboard with
 * no camera at all. Renders nothing in release builds — the production path stays
 * camera-only, exactly as spec §6 defines it.
 */
export function DevPayloadText({ payload }: { payload: string }) {
  const [show, setShow] = useState(false);
  if (!__DEV__) return null;

  return (
    <>
      <Pressable onPress={() => setShow(v => !v)}>
        <Text style={styles.toggle}>{show ? 'DEV: hide payload' : 'DEV: show payload (long-press to copy)'}</Text>
      </Pressable>
      {show && (
        <Text selectable style={styles.payload}>{payload}</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { color: colors.textDim, fontSize: 11, marginTop: 8, textDecorationLine: 'underline' },
  payload: {
    color: colors.textDim,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 6,
    padding: 8,
    backgroundColor: colors.primaryDark,
    borderRadius: 6,
  },
});
