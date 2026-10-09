import { StyleSheet, View } from 'react-native';
import { LOTTIE, LottieSlot } from '../components/Lottie';
import { ROUTE_MODE_COLORS, type RouteModeMarker as RouteModeMarkerData } from './otpRoutes';
import { isDarkTheme } from '../theme';

const animationForMode = {
  walking: LOTTIE.walking,
  bus: LOTTIE.bus,
  metro: LOTTIE.metro,
};

export const RouteModeMarker = ({ marker }: { marker: RouteModeMarkerData }) => (
  <View
    accessible
    accessibilityRole="image"
    accessibilityLabel={`${marker.mode} section${marker.line ? `, ${marker.line}` : ''}${marker.from || marker.to ? `, ${marker.from} to ${marker.to}` : ''}`}
    pointerEvents="none"
    style={[styles.marker, { borderColor: ROUTE_MODE_COLORS[marker.mode] }]}
  >
    <LottieSlot source={animationForMode[marker.mode]} size={34} />
  </View>
);

const styles = StyleSheet.create({
  marker: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 15,
    backgroundColor: isDarkTheme ? 'rgba(16,27,20,0.96)' : 'rgba(255,253,253,0.98)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
});
