import { StyleSheet, View } from 'react-native';
import { MapboxMap } from './MapboxMap';
import type { Place } from '../data/profile';

type Props = { location: Place | null; locationAccuracy: number | null; destination: Place | null; initial: string };

export const CommuteMap = ({ location, locationAccuracy, destination, initial }: Props) => (
  <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <MapboxMap location={location} locationAccuracy={locationAccuracy} destination={destination} initial={initial} />
  </View>
);
