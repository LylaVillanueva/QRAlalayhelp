// The website's neighbourhood scene (QRAlalay-Web/src/components/
// CommunityIllustration.jsx): an older resident supported by a barangay
// volunteer, beside a house and a tree. Decorative only.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { palette } from '../constants/theme';

const C = {
  ground: '#E3EFD6', wall: '#FFFFFF', window: '#E7F3FA',
  skinA: '#C98B5E', skinB: '#8E5B3D', hairGrey: '#D9D4CC', hairDark: '#2C2A33',
  navy: palette.DEEP_NAVY, red: palette.MALASAKIT_RED, yellow: palette.PAG_ASA_YELLOW,
  green: palette.KALIGTASAN_GREEN, blue: palette.BAYANIHAN_BLUE,
};

export default function CommunityIllustration({ width = 180, height = 100, style }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 360 200" style={style} accessible={false} importantForAccessibility="no-hide-descendants">
      <Circle cx="58" cy="46" r="18" fill={C.yellow} />
      <Path d="M0 168Q90 138 180 158T360 148V200H0Z" fill={C.ground} />
      <Rect x="238" y="110" width="56" height="50" rx="3" fill={C.wall} />
      <Path d="M228 114 266 82l38 32z" fill={C.red} />
      <Rect x="259" y="132" width="14" height="28" rx="2" fill={C.navy} />
      <Rect x="244" y="121" width="10" height="10" rx="1.5" fill={C.window} />
      <Rect x="279" y="121" width="10" height="10" rx="1.5" fill={C.window} />
      <Rect x="321" y="128" width="6" height="30" rx="2" fill={C.skinB} />
      <Circle cx="324" cy="118" r="20" fill={C.green} />
      <Path d="M146 66s-11-6.7-11-13.6c0-3.6 2.8-6.1 5.8-6.1 2.3 0 4.1 1.3 5.2 3.1 1.1-1.8 2.9-3.1 5.2-3.1 3 0 5.8 2.5 5.8 6.1 0 6.9-11 13.6-11 13.6z" fill={C.red} />
      <Rect x="110" y="144" width="8" height="24" rx="3" fill={C.navy} />
      <Rect x="122" y="144" width="8" height="24" rx="3" fill={C.navy} />
      <Rect x="104" y="106" width="32" height="42" rx="13" fill={C.yellow} />
      <Circle cx="120" cy="92" r="13" fill={C.skinA} />
      <Path d="M107 91a13 13 0 0 1 26 0c-5-4-21-4-26 0z" fill={C.hairGrey} />
      <Path d="M141 124v44" fill="none" stroke={C.navy} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="139" cy="124" r="4.5" fill={C.skinA} />
      <Rect x="161" y="140" width="9" height="28" rx="3" fill={C.navy} />
      <Rect x="175" y="140" width="9" height="28" rx="3" fill={C.navy} />
      <Rect x="155" y="94" width="36" height="52" rx="13" fill={C.blue} />
      <Path d="M160 106q-14-4-28 6" fill="none" stroke={C.navy} strokeWidth="9" strokeLinecap="round" />
      <Circle cx="173" cy="79" r="13" fill={C.skinB} />
      <Path d="M160 78a13 13 0 0 1 26-1c-6-5-17-6-26 1z" fill={C.hairDark} />
    </Svg>
  );
}
