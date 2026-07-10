import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

/**
 * Single source of truth for the in-app brand asset. Points at the DOWNSCALED
 * 512² mark, not the 1024² store icon (`townsquare_icon.png`) — the full-size
 * PNG would otherwise decode into memory at every placement. Swap the store
 * icon and this one file to rebrand everything.
 */
export const BRAND_MARK = require('../../assets/brand-mark.png');

interface Props {
  size?: number;
  rounded?: boolean;
  style?: StyleProp<ImageStyle>;
}

/** Ambient brand mark — rounded like the app icon players tapped to launch. */
export function BrandMark({ size = 28, rounded = true, style }: Props) {
  return (
    <Image
      source={BRAND_MARK}
      resizeMode="contain"
      style={[{ width: size, height: size, borderRadius: rounded ? size * 0.22 : 0 }, style]}
    />
  );
}
