// Shared bits for the SVG illustrations: a width-scaling SVG box, camera-view names, scene colours.
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg from 'react-native-svg';

/** SVG that fills the available width and keeps its viewBox aspect ratio. Announced as one image. */
export function SvgBox({ w, h, label, children, style }: { w: number; h: number; label: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: '100%', aspectRatio: w / h }, style]} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>{children}</Svg>
    </View>
  );
}

/** Camera views shown in the app. C1's CameraAngle is front / semi_side / side; C2 also reports rear. */
export type CameraView = 'side' | 'semi_side' | 'front' | 'rear';

export const CAMERA_VIEW: Record<CameraView, { label: string; hint: string; sees: string }> = {
  side: {
    label: 'Side-on',
    hint: 'Camera at 90° to the pitch, level with the bowling crease, looking across.',
    sees: 'Bowler in profile, running left → right across the frame.',
  },
  semi_side: {
    label: 'Semi-side',
    hint: 'Camera about 45° in front of the bowler, on the batting-end side.',
    sees: 'Bowler at a diagonal, coming toward the camera at an angle.',
  },
  front: {
    label: 'Front-on',
    hint: 'Camera behind the batting stumps, on the pitch line.',
    sees: 'Bowler facing you; the ball comes toward the camera.',
  },
  rear: {
    label: 'Rear',
    hint: "Camera behind the bowler's run-up, on the pitch line.",
    sees: "Bowler's back; the ball goes away from the camera.",
  },
};

/** 'semi-side', 'Semi_Side', 'side' ... -> CameraView (null if unknown). Name mapping only. */
export function toCameraView(v: string | null | undefined): CameraView | null {
  const k = (v ?? '').toLowerCase().replace(/[\s-]/g, '_');
  return k === 'side' || k === 'semi_side' || k === 'front' || k === 'rear' ? k : null;
}

/** Scene colours tuned for the dark theme. */
export const scene = {
  grass: '#0D2619',
  grassStripe: '#10301F',
  grassEdge: '#1C4A30',
  pitch: '#6B4F36',
  pitchEdge: '#8A6A48',
  crease: '#E9EDF7',
  stumps: '#F3E3C3',
  figure: '#F2F5FF',
  screen: '#0B1222',
  ground: '#1B2A22',
};
