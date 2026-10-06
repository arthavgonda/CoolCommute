import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Blur,
  Canvas,
  Group,
  Path,
  RadialGradient,
  Rect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  SharedValue,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
const SIZE = 56;
const STROKE = 6;
type Props = { loader: SharedValue<number> };
const SkiaLayer = ({ loader }: Props) => {
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height - 96;
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false);
  }, [ring]);
  const circle = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, (SIZE - STROKE) / 2);
    return p;
  }, [cx, cy]);
  const transform = useDerivedValue(() => [{ rotate: 2 * Math.PI * ring.value }]);
  const start = useDerivedValue(() => interpolate(ring.value, [0, 0.5, 1], [0.6, 0.3, 0.6]));
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height}>
        <RadialGradient
          c={vec(width / 2, height / 2)}
          r={Math.min(width, height) / 2}
          colors={['#252d24', '#101512']}
        />
        <Blur blur={100} />
      </Rect>
      <Group origin={vec(cx, cy)} transform={transform} opacity={loader}>
        <Path path={circle} color="#c5d18a" style="stroke" strokeWidth={STROKE} start={start} end={1} strokeCap="round" />
      </Group>
    </Canvas>
  );
};
export default SkiaLayer;
