import { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import GlassSurface from './GlassSurface';
import { CARD_COUNT, colors, radius } from '../theme';
export const useCardSize = () => {
  const { width, height } = useWindowDimensions();
  return {
    screenW: width,
    screenH: height,
    width: Math.min(width - 40, 380),
    height: Math.min(height * 0.7, 580),
  };
};
const mix = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};
const clamp01 = (v: number) => {
  'worklet';
  return Math.min(Math.max(v, 0), 1);
};
type Props = {
  index: number;
  active: boolean;
  step: SharedValue<number>;
  orbit: SharedValue<number>;
  finale: SharedValue<number>;
  children?: ReactNode;
};
export const GlassCard = ({ index, active, step, orbit, finale, children }: Props) => {
  const { screenW, screenH, width, height } = useCardSize();
  const rootStyle = useAnimatedStyle(() => {
    const p = step.value - index;
    const f = finale.value;
    const expansion = p >= 0 ? 1 : clamp01(p + 1);
    const expansionEase = expansion * expansion * (3 - 2 * expansion);
    const compactHeight = Math.max(104, Math.min(screenH * 0.16, 132));
    const cardHeight = mix(compactHeight, height, expansionEase);
    const a = orbit.value + (index * 2 * Math.PI) / CARD_COUNT;
    const near = (Math.sin(a) + 1) / 2;
    let x: number, y: number, s: number, rY: number, rZ: number, o: number;
    if (p <= 0) {
      const u = Math.max(p + 1, 0);
      x = mix(Math.cos(a) * width * 0.6, 0, u);
      y = mix(Math.sin(a) * height * 0.1, 0, u);
      s = mix(0.36 + 0.14 * near, 1, u);
      rY = mix(-Math.cos(a) * 0.8, 0, u);
      rZ = 0;
      o = mix(0.25 + 0.4 * near, 1, clamp01(u));
    } else {
      const q = Math.min(p, 1);
      const d = Math.max(p - 1, 0);
      x = 0;
      y = -(q * 22 + d * 10);
      s = 1 - 0.06 * q - 0.03 * d;
      rY = 0;
      rZ = (index % 2 ? 1 : -1) * 0.04 * q;
      o = Math.max(mix(1, 0.55, q) - 0.1 * d, 0.25);
    }
    const k = 1 - f;
    return {
      height: cardHeight,
      top: (screenH - cardHeight) / 2,
      opacity: mix(o, 1, f),
      transform: [
        { perspective: 10000 },
        { translateX: x * k },
        { translateY: y * k },
        { scale: mix(s, 0.55, f) },
        { rotate: `${(-Math.PI / 2) * f}rad` },
        { translateX: 25 * index * f },
        { rotateY: `${(Math.PI / 3) * f + rY * k}rad` },
        { rotate: `${(Math.PI / 4) * f + rZ * k}rad` },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => ({
    opacity: clamp01(1 - Math.abs(step.value - index) * 1.8) * (1 - finale.value),
  }));
  return (
    <Animated.View
      style={[
        styles.card,
        {
          borderColor: active || Platform.OS === 'web' ? colors.glassBorder : 'transparent',
          pointerEvents: active ? 'auto' : 'none',
          width,
          height,
          left: (screenW - width) / 2,
          top: (screenH - height) / 2,
          zIndex: active ? 10 : 1 + index,
          elevation: active ? 12 : 1 + index,
        },
        rootStyle,
      ]}>
      <GlassSurface width={width} height={height} active={active} />
      <Animated.View style={[styles.content, contentStyle]}>{children}</Animated.View>
    </Animated.View>
  );
};
const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderRadius: radius.card,
    borderWidth: 2,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(5px)' } as object) : null),
  },
  content: { flex: 1, padding: 24 },
});
