import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Camera } from '@rnmapbox/maps';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { Place } from '../data/profile';
import { getRouteLegMode, getRouteModeMarkers, ROUTE_MODE_COLORS, type RouteOption } from './otpRoutes';
import { RouteModeMarker } from './RouteModeMarker';
import { isDarkTheme } from '../theme';

const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
const USER_ZOOM = 14;
const OVERVIEW_ZOOM = 5.5;
let Mapbox: typeof import('@rnmapbox/maps') | null = null;
try {
  const nativeMapbox = require('@rnmapbox/maps') as typeof import('@rnmapbox/maps');
  if (token) nativeMapbox.setAccessToken(token);
  Mapbox = nativeMapbox;
} catch {
  Mapbox = null;
}

type Props = { location: Place | null; locationAccuracy: number | null; demoOrigin: Place | null; destination: Place | null; initial: string; routes: RouteOption[]; selectedRoute: number | null; onSelectRoute: (index: number) => void };

const UserMarker = ({ initial, precise }: { initial: string; precise: boolean }) => {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.ease) }), -1, false);
  }, [progress]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.38 * (1 - progress.value), transform: [{ scale: 0.7 + progress.value * 0.8 }] }));
  return (
    <View style={styles.marker}>
      {precise && <Animated.View style={[styles.pulse, pulseStyle]} />}
      <View style={[styles.avatar, !precise && styles.approximateAvatar]}><Text style={styles.avatarText}>{precise ? initial : '•'}</Text></View>
      <View style={styles.pin} />
    </View>
  );
};

export const MapboxMap = ({ location, locationAccuracy, demoOrigin, destination, initial, routes, selectedRoute, onSelectRoute }: Props) => {
  const camera = useRef<Camera | null>(null);
  const [zoom, setZoom] = useState(destination || (location && locationAccuracy !== null && locationAccuracy < 25) ? USER_ZOOM : location ? 12.5 : OVERVIEW_ZOOM);
  useEffect(() => {
    if (routes.length) {
      const coordinates = routes.flatMap(route => route.coordinates);
      const longitudes = coordinates.map(([lng]) => lng);
      const latitudes = coordinates.map(([, lat]) => lat);
      if (coordinates.length) {
        camera.current?.fitBounds(
          [Math.max(...longitudes), Math.max(...latitudes)],
          [Math.min(...longitudes), Math.min(...latitudes)],
          [130, 72, 180, 72],
          850,
        );
        return;
      }
    }
    const target = destination ?? location;
    const preciseLocation = location !== null && locationAccuracy !== null && locationAccuracy < 25;
    const nextZoom = destination || preciseLocation ? USER_ZOOM : location ? 12.5 : OVERVIEW_ZOOM;
    setZoom(nextZoom);
    if (target) camera.current?.setCamera({ centerCoordinate: [target.lng, target.lat], zoomLevel: nextZoom, animationMode: 'easeTo', animationDuration: 950 });
  }, [location?.lat, location?.lng, locationAccuracy, destination?.lat, destination?.lng, routes]);
  if (!token) {
    return <View style={styles.empty}><Text style={styles.emptyTitle}>Mapbox is ready to connect</Text><Text style={styles.emptyCopy}>Add your public Mapbox token to EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN.</Text></View>;
  }
  if (!Mapbox) {
    return <View style={styles.empty}><Text style={styles.emptyTitle}>Install the CoolCommute development build</Text><Text style={styles.emptyCopy}>Mapbox needs native code that Expo Go does not include. Build and install the Android app, then start Expo with the development client.</Text></View>;
  }
  const Map = Mapbox;
  const focus = destination ?? location;
  const center: [number, number] = focus ? [focus.lng, focus.lat] : [78.9629, 20.5937];
  const hasLocation = !!location;
  const preciseLocation = hasLocation && locationAccuracy !== null && Number.isFinite(locationAccuracy) && locationAccuracy < 25;
  const changeZoom = (delta: number) => {
    if (!location) return;
    const next = Math.max(2, Math.min(20, zoom + delta));
    setZoom(next);
    camera.current?.setCamera({ centerCoordinate: [location.lng, location.lat], zoomLevel: next, animationMode: 'easeTo', animationDuration: 420 });
  };
  return (
    <View style={styles.container}>
      <Map.MapView style={styles.map} styleURL={isDarkTheme ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'} logoEnabled attributionEnabled compassEnabled={false} scaleBarEnabled={false}>
        <Map.Camera ref={camera} centerCoordinate={center} zoomLevel={zoom} minZoomLevel={2} maxZoomLevel={20} animationMode="flyTo" animationDuration={900} />
        {routes.flatMap((route, routeIndex) => route.legs.map((leg, legIndex) => {
          if (leg.coordinates.length < 2) return null;
          const selected = routeIndex === selectedRoute;
          const color = selected ? ROUTE_MODE_COLORS[getRouteLegMode(leg.mode)] : '#87918a';
          const segmentId = `${route.id}-leg-${legIndex}`;
          return <Map.ShapeSource key={segmentId} id={`${segmentId}-source`} shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: leg.coordinates } }} onPress={() => onSelectRoute(routeIndex)}>
            <Map.LineLayer id={`${segmentId}-hit-target`} style={{ lineColor: color, lineWidth: 20, lineOpacity: 0.015, lineCap: 'round', lineJoin: 'round' }} />
            <Map.LineLayer id={`${segmentId}-line`} style={{ lineColor: color, lineWidth: selected ? 5 : 2, lineOpacity: selected ? 0.98 : 0.24, lineCap: 'round', lineJoin: 'round' }} />
          </Map.ShapeSource>;
        }))}
        {selectedRoute !== null && routes[selectedRoute] && getRouteModeMarkers(routes[selectedRoute]).map(marker => (
          <Map.MarkerView key={marker.id} id={marker.id} coordinate={marker.coordinate} anchor={{ x: 0.5, y: 0.5 }} allowOverlap={false}>
            <RouteModeMarker marker={marker} />
          </Map.MarkerView>
        ))}
        {!!demoOrigin && <Map.MarkerView id="commute-demo-origin" coordinate={[demoOrigin.lng, demoOrigin.lat]} anchor={{ x: 0.5, y: 0.9 }} allowOverlap>
          <View style={styles.demoOriginMarker}><Text style={styles.demoOriginText}>S</Text></View>
        </Map.MarkerView>}
        {!!destination && <Map.MarkerView id="commute-destination" coordinate={[destination.lng, destination.lat]} anchor={{ x: 0.5, y: 0.9 }} allowOverlap>
          <View style={styles.destinationMarker}><Text style={styles.destinationText}>D</Text></View>
        </Map.MarkerView>}
        {hasLocation && <Map.MarkerView id="commute-user" coordinate={[location.lng, location.lat]} anchor={{ x: 0.5, y: 0.86 }} allowOverlap>
          <UserMarker initial={initial} precise={preciseLocation} />
        </Map.MarkerView>}
      </Map.MapView>
      <View style={styles.zoomControls}>
        <Pressable disabled={!hasLocation} accessibilityLabel="Zoom in at your location" accessibilityRole="button" onPress={() => changeZoom(1)} style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomPressed, !hasLocation && styles.zoomDisabled]}><Text style={styles.zoomText}>+</Text></Pressable>
        <View style={styles.controlDivider} />
        <Pressable disabled={!hasLocation} accessibilityLabel="Zoom out at your location" accessibilityRole="button" onPress={() => changeZoom(-1)} style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomPressed, !hasLocation && styles.zoomDisabled]}><Text style={styles.zoomText}>−</Text></Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject },
  map: { ...StyleSheet.absoluteFillObject },
  zoomControls: { position: 'absolute', right: 12, top: 142, width: 39, overflow: 'hidden', borderRadius: 13, borderWidth: 1, borderColor: isDarkTheme ? 'rgba(235,241,224,0.18)' : 'rgba(139,83,101,0.18)', backgroundColor: isDarkTheme ? 'rgba(20,31,24,0.94)' : 'rgba(255,253,253,0.96)' },
  zoomButton: { height: 39, alignItems: 'center', justifyContent: 'center' },
  zoomPressed: { backgroundColor: isDarkTheme ? 'rgba(205,222,151,0.13)' : 'rgba(206,144,165,0.16)' },
  zoomDisabled: { opacity: 0.45 },
  zoomText: { color: isDarkTheme ? '#e7ecd9' : '#261b1f', fontSize: 23, lineHeight: 26, fontWeight: '400' },
  controlDivider: { height: 1, backgroundColor: isDarkTheme ? 'rgba(226,235,213,0.12)' : 'rgba(139,83,101,0.12)', marginHorizontal: 8 },
  empty: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: isDarkTheme ? '#17231c' : '#fbf5f7' },
  emptyTitle: { color: isDarkTheme ? '#ecf0e3' : '#211a1d', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { maxWidth: 280, color: isDarkTheme ? '#aab6a6' : '#73666b', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  destinationMarker: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#df765f', borderWidth: 3, borderColor: '#fff8ee', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  destinationText: { color: '#fffaf3', fontSize: 13, fontWeight: '800' },
  demoOriginMarker: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#9a86e8', borderWidth: 3, borderColor: '#f5f0ff', alignItems: 'center', justifyContent: 'center' },
  demoOriginText: { color: '#211d31', fontSize: 12, fontWeight: '900' },
  marker: { width: 68, height: 77, alignItems: 'center', justifyContent: 'flex-start' },
  pulse: { position: 'absolute', top: 1, width: 48, height: 48, borderRadius: 24, backgroundColor: '#c8d98f' },
  avatar: { zIndex: 2, width: 42, height: 42, borderRadius: 21, borderWidth: 3, borderColor: '#f6f6eb', backgroundColor: '#bcd17b', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  avatarText: { color: '#203126', fontSize: 13, fontWeight: '800' },
  approximateAvatar: { backgroundColor: '#e0e4d4', borderColor: '#fff8ee' },
  pin: { width: 11, height: 11, marginTop: -5, backgroundColor: '#bcd17b', borderRightWidth: 2, borderBottomWidth: 2, borderColor: '#f6f6eb', transform: [{ rotate: '45deg' }] },
});
