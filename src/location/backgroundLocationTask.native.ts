import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_LOCATION_TASK = 'coolcommute-background-location';

type LocationListener = (location: Location.LocationObject) => void;
const listeners = new Set<LocationListener>();

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error || !data?.locations) return;
  data.locations.forEach(location => listeners.forEach(listener => listener(location)));
});

export const subscribeToBackgroundLocations = (listener: LocationListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getBackgroundLocationRunning = () => Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

export const startBackgroundLocation = async () => {
  if (!(await TaskManager.isAvailableAsync())) throw new Error('Background location is unavailable in this app build.');
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    const requestedForeground = await Location.requestForegroundPermissionsAsync();
    if (requestedForeground.status !== 'granted') throw new Error('Allow location access while using the app first.');
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') return false;
  if (!(await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 15000,
      distanceInterval: 20,
      deferredUpdatesInterval: 30000,
      deferredUpdatesDistance: 50,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.Fitness,
      foregroundService: {
        notificationTitle: 'CoolCommute location is active',
        notificationBody: 'Location updates stay on this device and are not added to your commute history.',
        notificationColor: '#c9d98f',
        killServiceOnDestroy: false,
      },
    });
  }
  return true;
};

export const stopBackgroundLocation = async () => {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
};
