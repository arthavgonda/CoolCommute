import * as Location from 'expo-location';

const MAX_ACCURACY_METERS = 25;
const LOCATION_TIMEOUT_MS = 8000;

export const getLocationFix = async (
  onPosition: (position: Location.LocationObject) => void,
): Promise<Location.LocationObject> =>
  new Promise((resolve, reject) => {
    let subscription: Location.LocationSubscription | null = null;
    let settled = false;
    let bestPosition: Location.LocationObject | null = null;
    const finish = (position?: Location.LocationObject, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription?.remove();
      if (position ?? bestPosition) resolve(position ?? bestPosition as Location.LocationObject);
      else reject(error ?? new Error('Could not get a location fix. Move outdoors and try again.'));
    };
    const timeout = setTimeout(() => finish(), LOCATION_TIMEOUT_MS);
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      position => {
        const accuracy = position.coords.accuracy;
        const previousAccuracy = bestPosition?.coords.accuracy;
        const hasAccuracy = accuracy !== null && Number.isFinite(accuracy);
        const hasPreviousAccuracy = previousAccuracy !== null && previousAccuracy !== undefined && Number.isFinite(previousAccuracy);
        if (!bestPosition || (hasAccuracy && (!hasPreviousAccuracy || accuracy < previousAccuracy))) {
          bestPosition = position;
          onPosition(position);
        }
        if (accuracy !== null && Number.isFinite(accuracy) && accuracy < MAX_ACCURACY_METERS) finish(position);
      },
    ).then(nextSubscription => {
      subscription = nextSubscription;
      if (settled) subscription.remove();
    }).catch(error => finish(undefined, error instanceof Error ? error : new Error('Could not read your current location.')));
  });
