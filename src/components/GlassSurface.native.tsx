import { Canvas, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { isDarkTheme } from '../theme';

export const GlassSurface = ({ width, height, active = true }: { width: number; height: number; active?: boolean }) => (
  <View style={[styles.layer, !active && styles.inactive]}>
    <Canvas style={styles.canvas}>
      <RoundedRect x={0} y={0} width={width} height={height} r={isDarkTheme ? 20 : 30}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, height)}
          colors={isDarkTheme ? ['rgba(239, 237, 222, 0.18)', 'rgba(119, 132, 108, 0.12)', 'rgba(239, 237, 222, 0.045)'] : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.09)', 'rgba(255,255,255,0.035)']}
          positions={[0, 0.42, 1]}
        />
      </RoundedRect>
      <RoundedRect x={1} y={1} width={width - 2} height={Math.min(height * 0.32, 190)} r={isDarkTheme ? 19 : 29}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, Math.min(height * 0.32, 190))}
          colors={isDarkTheme ? ['rgba(255, 255, 246, 0.1)', 'rgba(255, 255, 246, 0.018)', 'rgba(255, 255, 246, 0)'] : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
          positions={[0, 0.55, 1]}
        />
      </RoundedRect>
      {active && <RoundedRect
        x={1.5}
        y={1.5}
        width={width - 3}
        height={height - 3}
        r={isDarkTheme ? 19 : 29}
        color={isDarkTheme ? 'rgba(239, 237, 222, 0.14)' : 'rgba(139, 83, 101, 0.12)'}
        style="stroke"
        strokeWidth={1}
      />}
    </Canvas>
  </View>
);

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, pointerEvents: 'none' },
  inactive: { opacity: 0.1 },
  canvas: { ...StyleSheet.absoluteFillObject, pointerEvents: 'none' },
});
