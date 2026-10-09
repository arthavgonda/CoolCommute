import { StyleSheet, View } from 'react-native';
import { isDarkTheme } from '../theme';

export const GlassSurface = (_: { active?: boolean }) => <View style={styles.surface as never} />;

const styles = StyleSheet.create({
  surface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    backgroundImage: isDarkTheme
      ? 'linear-gradient(138deg, rgba(239, 237, 222, 0.15) 0%, rgba(119, 132, 108, 0.09) 38%, rgba(239, 237, 222, 0.035) 100%), linear-gradient(180deg, rgba(255, 255, 246, 0.075) 0%, rgba(255, 255, 246, 0.012) 28%, rgba(255, 255, 246, 0) 52%)'
      : 'linear-gradient(138deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.09) 54%, rgba(255,255,255,0.035) 100%), linear-gradient(180deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.012) 38%, rgba(255,255,255,0) 58%)',
    pointerEvents: 'none',
  } as never,
});
