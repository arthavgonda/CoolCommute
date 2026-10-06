import type { LocationObject } from 'expo-location';

export const BACKGROUND_LOCATION_TASK = 'coolcommute-background-location';
export const subscribeToBackgroundLocations = (_listener: (location: LocationObject) => void) => () => {};
export const getBackgroundLocationRunning = async () => false;
export const startBackgroundLocation = async () => false;
export const stopBackgroundLocation = async () => {};
