import type { LocationObject } from 'expo-location';

export declare const BACKGROUND_LOCATION_TASK: string;
export declare const subscribeToBackgroundLocations: (listener: (location: LocationObject) => void) => () => void;
export declare const getBackgroundLocationRunning: () => Promise<boolean>;
export declare const startBackgroundLocation: () => Promise<boolean>;
export declare const stopBackgroundLocation: () => Promise<void>;
