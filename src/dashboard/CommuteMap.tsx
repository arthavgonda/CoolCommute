import { StyleSheet, View } from 'react-native';
import { MapboxMap } from './MapboxMap';
import type { Place } from '../data/profile';
import type { RouteOption } from './otpRoutes';

type Props = { location: Place | null; locationAccuracy: number | null; demoOrigin: Place | null; destination: Place | null; initial: string; routes: RouteOption[]; selectedRoute: number | null; onSelectRoute: (index: number) => void };

export const CommuteMap = ({ location, locationAccuracy, demoOrigin, destination, initial, routes, selectedRoute, onSelectRoute }: Props) => (
  <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <MapboxMap location={location} locationAccuracy={locationAccuracy} demoOrigin={demoOrigin} destination={destination} initial={initial} routes={routes} selectedRoute={selectedRoute} onSelectRoute={onSelectRoute} />
  </View>
);
