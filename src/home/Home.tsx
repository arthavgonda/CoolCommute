import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Animated, { Easing, FadeIn, FadeInDown, ZoomIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { deleteAccount, getCurrentUsername, getIdToken, signOut } from '../auth/cognito';
import { Button } from '../components/Button';
import { LOTTIE, LottieSlot } from '../components/Lottie';
import { CommuteMap } from '../dashboard/CommuteMap';
import { LocationResult, reverseGeocodeLocation, searchLocation, searchLocations } from '../dashboard/locationSearch';
import { getRideQuote, getScoredRoutes, getRouteLegMode, isInsideRouteServiceArea, ROUTE_MODE_COLORS, ROUTE_SERVICE_AREA_BBOX, type FallbackRide, type RideQuote, type RouteAdvice, type RouteMode, type RouteOption } from '../dashboard/otpRoutes';
import { removeJson, sizeOf } from '../data/localStore';
import { Place, Profile, deleteRemoteProfile, loadProfile, removeProfile, saveProfile, uploadProfile } from '../data/profile';
import { labelFor, QUESTIONS, QuestionKey } from '../data/questions';
import { isDarkTheme } from '../theme';
import { getBackgroundLocationRunning, startBackgroundLocation, stopBackgroundLocation, subscribeToBackgroundLocations } from '../location/backgroundLocationTask';

type ViewName = 'today' | 'account';
const DELHI_DEMO_CENTER: Place = { lat: 28.6139, lng: 77.209 };

const summarizeRouteModes = (route: RouteOption) => {
  const totals: Record<RouteMode, { durationSeconds: number; distanceMeters: number }> = {
    walking: { durationSeconds: 0, distanceMeters: 0 },
    bus: { durationSeconds: 0, distanceMeters: 0 },
    metro: { durationSeconds: 0, distanceMeters: 0 },
  };
  route.legs.forEach(leg => {
    const mode = getRouteLegMode(leg.mode);
    totals[mode].durationSeconds += leg.durationSeconds;
    totals[mode].distanceMeters += leg.distanceMeters;
  });
  return (['walking', 'bus', 'metro'] as const)
    .map(mode => ({ mode, ...totals[mode], used: totals[mode].durationSeconds > 0 || totals[mode].distanceMeters > 0 }));
};

const ROUTE_MODE_LABELS: Record<RouteMode, string> = { walking: 'Walk', bus: 'Bus', metro: 'Metro' };
const adapt = (light: string, dark: string) => isDarkTheme ? dark : light;
const routeTime = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

const recommendedRouteIndex = (routes: RouteOption[]) => routes.reduce((best, route, index) => (
  route.score !== null && (best < 0 || route.score < (routes[best].score ?? Number.POSITIVE_INFINITY)) ? index : best
), -1);

const fareText = (fare: RideQuote['bike']) => fare ? `₹${fare.min}–₹${fare.max}` : null;

const Card = ({ title, children, style, index = 0 }: { title: string; children: ReactNode; style?: object; index?: number }) => {
  const [expanded, setExpanded] = useState(false);
  const progress = useSharedValue(0);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }] }));
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    progress.value = withSpring(next ? 1 : 0, { damping: 25, stiffness: 210, mass: 0.85 });
  };
  return (
    <Animated.View entering={FadeInDown.delay(index * 85).springify().damping(18).stiffness(165)} style={[styles.card, style]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Animated.Text style={[styles.cardChevron, chevronStyle]}>⌄</Animated.Text>
      </Pressable>
      <SmoothCollapse expanded={expanded} style={styles.cardBody}>{children}</SmoothCollapse>
    </Animated.View>
  );
};

const SmoothCollapse = ({ expanded, children, style }: { expanded: boolean; children: ReactNode; style?: object }) => {
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(expanded ? 1 : 0);
  const bodyStyle = useAnimatedStyle(() => ({
    height: contentHeight * progress.value,
    opacity: interpolate(progress.value, [0, 0.16, 1], [0, 0.35, 1]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [-7, 0]) }],
  }), [contentHeight]);

  useEffect(() => {
    progress.value = withSpring(expanded ? 1 : 0, { damping: 25, stiffness: 210, mass: 0.85 });
  }, [expanded, progress]);

  return (
    <Animated.View pointerEvents={expanded ? 'auto' : 'none'} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'} style={[styles.cardBodyClip, bodyStyle]}>
      <View onLayout={event => {
        const height = event.nativeEvent.layout.height;
        if (height !== contentHeight) setContentHeight(height);
      }} style={style}>{children}</View>
    </Animated.View>
  );
};

const Row = ({ label, detail, action, onPress, ghost }: { label: string; detail?: string; action?: string; onPress?: () => void; ghost?: boolean }) => (
  <View style={styles.accountRow}>
    <View style={styles.accountRowCopy}>
      <Text style={styles.accountLabel}>{label}</Text>
      {!!detail && <Text style={styles.accountDetail}>{detail}</Text>}
    </View>
    {!!action && <View style={styles.accountAction}><Button label={action} onPress={onPress ?? (() => {})} ghost={ghost} compact /></View>}
  </View>
);

export const Home = ({ onSignedOut }: { onSignedOut: () => void }) => {
  const { width, height } = useWindowDimensions();
  const wide = width >= 960;
  const [view, setView] = useState<ViewName>('today');
  const [accountClosing, setAccountClosing] = useState(false);
  const accountClosePending = useRef(false);
  const accountProgress = useSharedValue(0);
  const accountMotionStyle = useAnimatedStyle(() => ({
    opacity: accountProgress.value,
    transform: [
      { translateY: interpolate(accountProgress.value, [0, 1], [28, 0]) },
      { scale: interpolate(accountProgress.value, [0, 1], [0.985, 1]) },
    ],
  }));
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapLocation, setMapLocation] = useState<Profile['location']>(null);
  const [mapAccuracy, setMapAccuracy] = useState<number | null>(null);
  const [destination, setDestination] = useState<{ place: Place; label: string } | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeAdvice, setRouteAdvice] = useState<RouteAdvice | null>(null);
  const [rideQuotes, setRideQuotes] = useState<Array<RideQuote | null>>([]);
  const [rideQuotesLoading, setRideQuotesLoading] = useState(false);
  const routeOriginRef = useRef<Place | null>(null);
  const pendingRouteRef = useRef<{ place: Place; label: string } | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeRequestRef = useRef(0);
  const demoOriginRef = useRef<LocationResult | null>(null);
  const demoOriginPromptShown = useRef(false);
  const [demoOriginDialogOpen, setDemoOriginDialogOpen] = useState(false);
  const [demoOriginQuery, setDemoOriginQuery] = useState('');
  const [demoOriginSuggestions, setDemoOriginSuggestions] = useState<LocationResult[]>([]);
  const [demoOriginLoading, setDemoOriginLoading] = useState(false);
  const [demoOriginLabel, setDemoOriginLabel] = useState('');
  const [mapLabel, setMapLabel] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [accountContentHeight, setAccountContentHeight] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationAccessOpen, setLocationAccessOpen] = useState(false);
  const [locationAccessGranted, setLocationAccessGranted] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionKey | null>(null);
  const [permission, setPermission] = useState('undetermined');
  const [permissionCanAskAgain, setPermissionCanAskAgain] = useState(true);
  const pendingLocationAction = useRef<'locate' | 'search' | null>(null);
  const locationGrantedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveLocationReady, setLiveLocationReady] = useState(false);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [trackingKey, setTrackingKey] = useState(0);
  const [initial, setInitial] = useState('Y');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<LocationResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const noticeProgress = useSharedValue(0);
  const noticeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: noticeProgress.value,
    transform: [{ translateY: interpolate(noticeProgress.value, [0, 1], [120, 0]) }],
  }));
  const [locationError, setLocationError] = useState('');
  const [currentLabel, setCurrentLabel] = useState('Location not set');

  useEffect(() => () => routeAbortRef.current?.abort(), []);

  const finishAccountClose = useCallback(() => {
    accountClosePending.current = false;
    setAccountClosing(false);
    setView('today');
  }, []);

  const closeAccount = () => {
    if (accountClosePending.current || view !== 'account') return;
    accountClosePending.current = true;
    setAccountClosing(true);
    accountProgress.value = withSpring(0, { damping: 25, stiffness: 190, mass: 0.9 }, finished => {
      if (finished) runOnJS(finishAccountClose)();
    });
  };

  const openAccount = () => {
    accountClosePending.current = false;
    setAccountClosing(false);
    setView('account');
    accountProgress.value = withSpring(1, { damping: 25, stiffness: 190, mass: 0.9 });
  };

  const refresh = useCallback(async () => {
    const [saved, bytes, backgroundEnabled] = await Promise.all([
      loadProfile(),
      sizeOf('cache'),
      Platform.OS === 'web' ? Promise.resolve(false) : getBackgroundLocationRunning().catch(() => false),
    ]);
    setProfile(saved);
    setCacheBytes(bytes);
    setBackgroundTracking(backgroundEnabled);
    const savedLabel = saved?.locationLabel || (saved?.location ? 'Home' : 'Location not set');
    setCurrentLabel('Location not available');
    setLiveLocationReady(false);
    setMapLocation(saved?.location ?? null);
    setMapAccuracy(saved?.locationAccuracy ?? null);
    setMapLabel(savedLabel);
    const usernameInitial = getCurrentUsername()?.trim().charAt(0).toUpperCase();
    setInitial(usernameInitial && /[A-Z]/.test(usernameInitial) ? usernameInitial : 'Y');
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermission(result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'undetermined');
        setPermissionCanAskAgain(result.state !== 'denied');
      } else {
        const locationPermission = await Location.getForegroundPermissionsAsync();
        setPermission(locationPermission.status);
        setPermissionCanAskAgain(locationPermission.canAskAgain);
      }
    } catch {
      setPermission('undetermined');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (permission !== 'granted') return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let initialFixReceived = false;
    const initialFixTimer = setTimeout(() => {
      if (cancelled || initialFixReceived) return;
      // Do not leave the account panel showing an endless loading message. A
      // later cached/GPS fix will still replace this status automatically.
      setCurrentLabel('Location not acquired yet');
      setLiveLocationReady(true);
    }, 950);
    let lastLabelLookup: { lat: number; lng: number } | null = null;
    let reverseLookupId = 0;
    let hasResolvedPlaceName = false;
    const applyPosition = (position: Location.LocationObject) => {
      const accuracy = position.coords.accuracy;
      if (accuracy === null || !Number.isFinite(accuracy) || cancelled) return;
      initialFixReceived = true;
      clearTimeout(initialFixTimer);
      setMapLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      setMapAccuracy(accuracy);
      setMapLabel('Your current area');
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const liveOrigin = { lat: latitude, lng: longitude };
      const insideServiceArea = isInsideRouteServiceArea(liveOrigin);
      if (insideServiceArea) {
        demoOriginRef.current = null;
        setDemoOriginLabel('');
        demoOriginPromptShown.current = false;
        setDemoOriginDialogOpen(false);
      } else if (!demoOriginRef.current && !demoOriginPromptShown.current) {
        demoOriginPromptShown.current = true;
        setDemoOriginDialogOpen(true);
      }
      const routeOrigin = demoOriginRef.current?.place ?? (insideServiceArea ? liveOrigin : null);
      routeOriginRef.current = routeOrigin;
      const pendingRoute = pendingRouteRef.current;
      if (pendingRoute && routeOrigin) {
        pendingRouteRef.current = null;
        void loadRoutes(routeOrigin, pendingRoute);
      }
      setLiveLocationReady(true);
      setLocationError('');

      const movedEnoughToRename = !lastLabelLookup || Math.hypot(
        (latitude - lastLabelLookup.lat) * 111_000,
        (longitude - lastLabelLookup.lng) * 111_000 * Math.cos(latitude * Math.PI / 180),
      ) >= 300;
      if ((!hasResolvedPlaceName && !lastLabelLookup) || movedEnoughToRename) {
        lastLabelLookup = { lat: latitude, lng: longitude };
        const lookupId = ++reverseLookupId;
        if (!hasResolvedPlaceName) setCurrentLabel('Finding nearby place…');
        void reverseGeocodeLocation(latitude, longitude).then(placeName => {
          if (cancelled || lookupId !== reverseLookupId) return;
          hasResolvedPlaceName = true;
          setCurrentLabel(placeName || 'Nearby area');
        });
      }
    };
    const unsubscribeBackground = backgroundTracking ? subscribeToBackgroundLocations(applyPosition) : null;
    // Paint a recent device fix immediately when available, then ask for a quick
    // network-assisted fix. The high accuracy watcher below refines it afterwards.
    void Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 2_000 })
      .then(position => { if (position) applyPosition(position); })
      .catch(() => {});
    // Browsers can return their cached coarse fix immediately. Expo's web
    // adapter has no timeout option, so request it directly with a short bound.
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(position => {
        applyPosition({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
          timestamp: position.timestamp,
        });
      }, () => {}, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 850 });
    }
    void Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: false,
    }).then(applyPosition).catch(() => {});
    if (!backgroundTracking) {
      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2500, distanceInterval: 5 },
        applyPosition,
      ).then(nextSubscription => {
        if (cancelled) nextSubscription.remove();
        else subscription = nextSubscription;
      }).catch(error => {
        if (!cancelled) {
          pendingLocationAction.current = 'locate';
          setLocationError((error as Error).message || 'Could not update your current location.');
          setLocationAccessOpen(true);
        }
      });
    }
    return () => {
      cancelled = true;
      clearTimeout(initialFixTimer);
      subscription?.remove();
      unsubscribeBackground?.();
    };
  }, [backgroundTracking, permission, trackingKey]);

  useEffect(() => {
    if (!note) {
      noticeProgress.value = 0;
      return;
    }

    noticeProgress.value = withTiming(1, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
    const timer = setTimeout(() => {
      noticeProgress.value = withTiming(0, {
        duration: 380,
        easing: Easing.in(Easing.cubic),
      }, finished => {
        if (finished) runOnJS(setNote)('');
      });
    }, noteError ? 5200 : 3600);
    return () => clearTimeout(timer);
  }, [note, noteError, noticeProgress]);

  useEffect(() => {
    const normalized = query.trim();
    if (view !== 'today' || normalized.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let active = true;
    setSuggestions([]);
    setSuggestionsLoading(true);
    const timer = setTimeout(() => {
      void searchLocations(normalized, 6, true, { proximity: mapLocation ?? undefined }).then(results => {
        if (active) setSuggestions(results);
      }).catch(() => {
        if (active) setSuggestions([]);
      }).finally(() => {
        if (active) setSuggestionsLoading(false);
      });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, view, mapLocation?.lat, mapLocation?.lng]);

  useEffect(() => {
    const normalized = demoOriginQuery.trim();
    if (!demoOriginDialogOpen || normalized.length < 2) {
      setDemoOriginSuggestions([]);
      setDemoOriginLoading(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setDemoOriginLoading(true);
      void searchLocations(normalized, 6, true, { proximity: DELHI_DEMO_CENTER, bbox: ROUTE_SERVICE_AREA_BBOX }).then(results => {
        if (active) setDemoOriginSuggestions(results);
      }).catch(() => {
        if (active) setDemoOriginSuggestions([]);
      }).finally(() => {
        if (active) setDemoOriginLoading(false);
      });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [demoOriginDialogOpen, demoOriginQuery]);

  const showNote = (message: string, error = false) => {
    setNote(message);
    setNoteError(error);
  };

  const openRapido = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      showNote('Could not open Rapido. Try again in a moment.', true);
    }
  };

  const loadRoutes = async (from: Place, to: { place: Place; label: string }) => {
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    const requestId = ++routeRequestRef.current;
    setRoutes([]);
    setSelectedRoute(null);
    setRouteAdvice(null);
    setRideQuotes([]);
    setRideQuotesLoading(false);
    setRoutesLoading(true);

    try {
      const result = await getScoredRoutes(from, to.place, controller.signal);
      if (requestId !== routeRequestRef.current) return;
      setRoutes(result.routes);
      setRouteAdvice(result.advice);
      const bestIndex = recommendedRouteIndex(result.routes);
      setSelectedRoute(bestIndex >= 0 ? bestIndex : null);
      setDestination(to);
      if (!result.routes.length) showNote('No transit routes were found for this trip.', true);
      const worthwhileRides = result.advice.rides.filter(ride => ride.worthIt);
      if (worthwhileRides.length) {
        setRideQuotesLoading(true);
        void Promise.all(worthwhileRides.map(ride => getRideQuote(
          { lat: ride.pickup.lat, lng: ride.pickup.lon },
          to.place,
          controller.signal,
        ).catch(() => {
          return null;
        }))).then(quotes => {
          if (requestId === routeRequestRef.current) setRideQuotes(quotes);
        }).finally(() => {
          if (requestId === routeRequestRef.current) setRideQuotesLoading(false);
        });
      }
    } catch (error) {
      if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
      showNote((error as Error).message || 'Could not find transit routes.', true);
    } finally {
      if (requestId === routeRequestRef.current) setRoutesLoading(false);
    }
  };

  const planToDestination = (result: LocationResult) => {
    setDestination(result);
    setRoutes([]);
    setSelectedRoute(null);
    setRouteAdvice(null);
    setRideQuotes([]);
    setRideQuotesLoading(false);
    showNote('');
    const origin = routeOriginRef.current;
    if (origin) void loadRoutes(origin, result);
    else {
      routeAbortRef.current?.abort();
      routeRequestRef.current += 1;
      pendingRouteRef.current = result;
      setRoutesLoading(false);
      if (mapLocation && !isInsideRouteServiceArea(mapLocation)) setDemoOriginDialogOpen(true);
    }
  };

  const chooseDemoOrigin = (result: LocationResult) => {
    demoOriginRef.current = result;
    routeOriginRef.current = result.place;
    setDemoOriginLabel(result.label);
    setDemoOriginQuery('');
    setDemoOriginSuggestions([]);
    setDemoOriginDialogOpen(false);
    const pending = pendingRouteRef.current;
    if (pending) {
      pendingRouteRef.current = null;
      void loadRoutes(result.place, pending);
    }
  };

  const chooseRoute = useCallback((index: number) => {
    setSelectedRoute(index);
  }, [routes]);

  const saveHomeLocation = async (place: NonNullable<Profile['location']>, label: string, accuracy: number) => {
    setBusy(true);
    try {
      const next: Profile = { ...(profile ?? {}), location: place, locationLabel: label, locationAccuracy: accuracy, synced: false };
      await saveProfile(next);
      setProfile(next);
      setCurrentLabel(label);
      const token = await getIdToken().catch(() => null);
      if (token) {
        try {
          await uploadProfile(token, next);
          const synced = { ...next, synced: true };
          await saveProfile(synced);
          setProfile(synced);
        } catch {
          setNote('');
        }
      }
      setNote('');
    } catch (error) {
      showNote((error as Error).message || 'Could not save the home location.', true);
    } finally {
      setBusy(false);
    }
  };

  const finishLocationGranted = (action: 'locate' | 'search') => {
    pendingLocationAction.current = null;
    setLocationError('');
    setLocationAccessGranted(true);
    setLocationAccessOpen(true);
    if (action === 'locate') setTrackingKey(value => value + 1);
    if (action === 'search') void performSearch();
    if (locationGrantedTimer.current) clearTimeout(locationGrantedTimer.current);
    locationGrantedTimer.current = setTimeout(() => {
      setLocationAccessOpen(false);
      setLocationAccessGranted(false);
      locationGrantedTimer.current = null;
    }, 1250);
  };

  const openLocationAccess = async (action: 'locate' | 'search') => {
    pendingLocationAction.current = action;
    setLocationError('');
    // Permission state can still be stale immediately after the screen opens.
    // Check the platform before presenting a prompt that the user has already accepted.
    try {
      const result = await Location.getForegroundPermissionsAsync();
      setPermission(result.status);
      setPermissionCanAskAgain(result.canAskAgain);
      if (result.status === 'granted') {
        finishLocationGranted(action);
        return;
      }
    } catch {
      // Keep the in-app explanation available if the platform check itself fails.
    }
    setLocationAccessOpen(true);
  };

  const performSearch = async () => {
    setBusy(true);
    showNote('');
    try {
      const result = await searchLocation(query, mapLocation ?? undefined);
      planToDestination(result);
      setSuggestions([]);
      setNote('');
      setQuery('');
    } catch (error) {
      showNote((error as Error).message || 'Could not find that location.', true);
    } finally {
      setBusy(false);
    }
  };

  const submitSearch = () => {
    if (!query.trim() || busy) return;
    if (permission !== 'granted' && !__DEV__ && Platform.OS !== 'web') {
      openLocationAccess('search');
      return;
    }
    void performSearch();
  };

  const locate = () => {
    if (busy) return;
    if (permission === 'granted') {
      setLocationError('');
      setTrackingKey(value => value + 1);
      return;
    }
    openLocationAccess('locate');
  };

  const allowLocationAccess = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let permissionResult = await Location.getForegroundPermissionsAsync();
      if (permissionResult.status !== 'granted' && permissionResult.canAskAgain) {
        permissionResult = await Location.requestForegroundPermissionsAsync();
      }
      setPermission(permissionResult.status);
      setPermissionCanAskAgain(permissionResult.canAskAgain);
      if (permissionResult.status !== 'granted' && !permissionResult.canAskAgain && Platform.OS !== 'web') {
        await Linking.openSettings();
        return;
      }
      if (permissionResult.status !== 'granted') return;
      const action = pendingLocationAction.current;
      if (action) finishLocationGranted(action);
    } catch (error) {
      setLocationError((error as Error).message || 'Could not check location access.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => {
    if (locationGrantedTimer.current) clearTimeout(locationGrantedTimer.current);
  }, []);

  const toggleBackgroundTracking = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (backgroundTracking) {
        await stopBackgroundLocation();
        setBackgroundTracking(false);
      } else {
        const enabled = await startBackgroundLocation();
        setBackgroundTracking(enabled);
        if (!enabled) showNote('Background access was not enabled. You can keep using location while the app is open.', true);
      }
    } catch (error) {
      showNote((error as Error).message || 'Could not update background location access.', true);
    } finally {
      setBusy(false);
    }
  };

  const chooseDestination = (result: LocationResult) => {
    planToDestination(result);
    setSuggestions([]);
    setQuery('');
    setNote('');
  };

  const retrySync = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const token = await getIdToken();
      const homeProfile = { ...profile, location: profile.location ?? null, locationLabel: profile.location ? profile.locationLabel : undefined };
      await uploadProfile(token, homeProfile);
      const synced = { ...profile, synced: true };
      await saveProfile(synced);
      setProfile(synced);
      showNote('Your commute profile is backed up.');
    } catch (error) {
      showNote((error as Error).message || 'Could not sync your profile.', true);
    } finally {
      setBusy(false);
    }
  };

  const updatePreference = async (key: QuestionKey, value: string) => {
    if (!profile || busy) return;
    setBusy(true);
    const next: Profile = { ...profile, [key]: value, synced: false };
    try {
      await saveProfile(next);
      setProfile(next);
      setEditingQuestion(null);
      const token = await getIdToken().catch(() => null);
      if (token) {
        try {
          await uploadProfile(token, next);
          const synced = { ...next, synced: true };
          await saveProfile(synced);
          setProfile(synced);
        } catch (error) {
          showNote((error as Error).message || 'Saved on this device. Cloud sync will need another try.', true);
          return;
        }
      }
      showNote('Your commute preference was updated.');
    } catch (error) {
      showNote((error as Error).message || 'Could not update your preference.', true);
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    try {
      const json = JSON.stringify(profile ?? {}, null, 2);
      const filename = `coolcommute-profile-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Export commute profile' });
        } else {
          await Share.share({ message: json });
        }
      }
      showNote('Your profile was exported as a JSON file.');
    } catch {
      showNote('Could not export your profile.', true);
    }
  };

  const removeAccount = async () => {
    setBusy(true);
    try {
      await stopBackgroundLocation().catch(() => undefined);
      await deleteRemoteProfile(await getIdToken()).catch(() => undefined);
      await deleteAccount();
      await removeProfile();
      await removeJson('cache');
      onSignedOut();
    } catch (error) {
      showNote((error as Error).message || 'Could not delete the account.', true);
    } finally {
      setBusy(false);
      setDeleteConfirmOpen(false);
    }
  };

  const logout = async () => {
    await stopBackgroundLocation().catch(() => undefined);
    signOut();
    onSignedOut();
  };

  const mapDisplayLocation = mapLocation ?? null;
  const mapDisplayAccuracy = mapAccuracy;
  const demoRouteOrigin = demoOriginRef.current?.place ?? null;
  const activeRoute = selectedRoute === null ? null : routes[selectedRoute] ?? null;
  const recommendedIndex = recommendedRouteIndex(routes);
  const activeRouteModes = activeRoute ? summarizeRouteModes(activeRoute) : [];
  const routeOriginName = demoOriginLabel || (liveLocationReady ? currentLabel : mapLabel) || 'Your location';
  const recommendedRides: FallbackRide[] = routeAdvice?.rides.filter(ride => ride.worthIt) ?? [];

  return (
    <View style={styles.root}>
      <CommuteMap location={mapDisplayLocation} locationAccuracy={mapDisplayAccuracy} demoOrigin={demoRouteOrigin} destination={destination?.place ?? null} initial={initial} routes={routes} selectedRoute={selectedRoute} onSelectRoute={chooseRoute} />
      <View pointerEvents="box-none" style={styles.overlay}>
        <View pointerEvents="box-none" style={[styles.topArea, wide && styles.topAreaWide]}>
          {menuOpen && <View style={[styles.menuPanel, wide && styles.menuPanelWide]}>
            <Pressable onPress={() => { setView('today'); setMenuOpen(false); }} style={styles.menuItem}><Text style={styles.menuItemText}>Map</Text></Pressable>
            <Pressable onPress={() => { openAccount(); setMenuOpen(false); }} style={styles.menuItem}><Text style={styles.menuItemText}>Account</Text></Pressable>
            <Pressable disabled={!mapLocation || mapAccuracy === null || mapAccuracy >= 25 || busy} onPress={() => { if (mapLocation && mapAccuracy !== null && mapAccuracy < 25) { setMenuOpen(false); void saveHomeLocation(mapLocation, mapLabel || 'Home', mapAccuracy); } }} style={[styles.menuItem, (!mapLocation || mapAccuracy === null || mapAccuracy >= 25) && styles.disabled]}><Text style={styles.menuItemText}>Save current location as home</Text></Pressable>
          </View>}
          {view === 'today' ? (
            <>
              <View style={styles.searchContainer}>
                <View style={styles.searchRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Open navigation menu" accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(value => !value)} style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
                    <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLine} />
                  </Pressable>
                  <View style={styles.searchField}>
                    <Text style={styles.searchGlyph}>⌕</Text>
                    <TextInput accessibilityLabel="Search any place, address, or landmark" value={query} onChangeText={setQuery} onSubmitEditing={() => void submitSearch()} placeholder="Search any place, address, or landmark" placeholderTextColor="#aab4aa" returnKeyType="search" style={styles.searchInput} />
                  </View>
                  <Pressable disabled={busy || !query.trim()} onPress={() => void submitSearch()} style={({ pressed }) => [styles.searchButton, (busy || !query.trim()) && styles.searchButtonDisabled, pressed && styles.pressed]}><Text style={[styles.searchButtonText, (busy || !query.trim()) && styles.searchButtonTextDisabled]}>{busy ? '…' : 'Search'}</Text></Pressable>
                </View>
                {!suggestionsLoading && (suggestions.length > 0 || query.trim().length >= 2) && <View style={styles.suggestionsPanel}>
                  {suggestions.length ? suggestions.map((suggestion, index) => <Pressable key={`${suggestion.place.lng}:${suggestion.place.lat}:${index}`} accessibilityRole="button" onPress={() => chooseDestination(suggestion)} style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionPressed]}><Text style={styles.suggestionGlyph}>⌖</Text><Text numberOfLines={2} style={styles.suggestionText}>{suggestion.label}</Text></Pressable>) : <Text style={styles.suggestionMessage}>No places found</Text>}
                </View>}
              </View>
              {(permission !== 'granted' || !!locationError) && <Pressable accessibilityRole="button" accessibilityLabel="Use my location" disabled={busy} onPress={() => void locate()} style={({ pressed }) => [styles.locateButton, pressed && styles.pressed]}><Text style={styles.locateGlyph}>◎</Text><Text style={styles.locateText}>{busy ? 'Updating location…' : 'Use my location'}</Text></Pressable>}
              {!!demoOriginLabel && <Pressable accessibilityRole="button" onPress={() => { setDemoOriginQuery(''); setDemoOriginDialogOpen(true); }} style={({ pressed }) => [styles.demoOriginPill, pressed && styles.pressed]}><Text numberOfLines={1} style={styles.demoOriginPillText}>Delhi demo start · {demoOriginLabel} · Change</Text></Pressable>}
            </>
          ) : null}
        </View>

        {view === 'today' && destination && (routesLoading || routes.length > 0) && <Animated.View entering={FadeInDown.duration(260)} style={[styles.journeyPanel, { maxHeight: Math.max(250, height * (wide ? 0.72 : 0.8)), width: wide ? 370 : Math.max(250, width - 32) }]}>
          <View style={styles.journeyPanelHeader}>
            <View style={styles.journeyPanelHeadingCopy}>
              <Text style={styles.journeyEyebrow}>YOUR JOURNEY</Text>
              <Text style={styles.journeyDestination} numberOfLines={1}>To {destination.label}</Text>
            </View>
            {routesLoading && <ActivityIndicator size="small" color="#c9d98f" />}
          </View>
          {routesLoading ? <View style={styles.journeyLoading}><ActivityIndicator size="small" color="#c9d98f" /><Text style={styles.routeMapHintText}>Finding transit routes…</Text></View> : activeRoute ? <ScrollView style={styles.journeyScroll} contentContainerStyle={styles.journeyContent} showsVerticalScrollIndicator={false}>
            <View style={styles.journeySummary}>
              <View><Text style={styles.journeyTotal}>{Math.max(1, Math.round(activeRoute.durationSeconds / 60))}<Text style={styles.journeyTotalUnit}> min</Text></Text><Text style={styles.journeySummaryCaption}>{activeRoute.label} · {(activeRoute.distanceMeters / 1000).toFixed(1)} km</Text>{(routeTime(activeRoute.startTime) || routeTime(activeRoute.endTime)) && <Text style={styles.journeyTimeRange}>{routeTime(activeRoute.startTime) ?? 'Depart'} – {routeTime(activeRoute.endTime) ?? 'Arrive'}</Text>}</View>
              {recommendedIndex >= 0 && selectedRoute === recommendedIndex && <Text style={styles.routeHintRecommended}>Recommended</Text>}
            </View>
            <View style={styles.journeyPlaces}>
              <View style={styles.journeyPlaceMarker}><View style={styles.journeyStartDot} /><View style={styles.journeyPlaceRule} /><View style={styles.journeyEndDot} /></View>
              <View style={styles.journeyPlaceLabels}><Text numberOfLines={1} style={styles.journeyPlaceText}>From · {routeOriginName}</Text><Text numberOfLines={1} style={styles.journeyPlaceText}>To · {destination.label}</Text></View>
            </View>
            <View style={styles.journeySectionHeading}><Text style={styles.journeySectionTitle}>Trip steps</Text><Text style={styles.journeySectionMeta}>{activeRoute.legs.length} {activeRoute.legs.length === 1 ? 'leg' : 'legs'}</Text></View>
            <View style={styles.journeyLegList}>
              {activeRoute.legs.map((leg, index) => {
                const mode = getRouteLegMode(leg.mode);
                const minutes = Math.max(1, Math.round(leg.durationSeconds / 60));
                const distance = leg.distanceMeters >= 1000 ? `${(leg.distanceMeters / 1000).toFixed(1)} km` : `${Math.round(leg.distanceMeters)} m`;
                const modeName = ROUTE_MODE_LABELS[mode];
                const modeDetail = mode === 'walking' ? 'Walk' : `${modeName}${leg.line ? ` · ${leg.line}` : ''}`;
                return <View key={`${activeRoute.id}-step-${index}`} style={styles.journeyLegRow}>
                  <View style={styles.journeyLegRail}><View style={[styles.journeyLegDot, { backgroundColor: ROUTE_MODE_COLORS[mode] }]} />{index < activeRoute.legs.length - 1 && <View style={styles.journeyLegConnector} />}</View>
                  <View style={styles.journeyLegCopy}>
                    <View style={styles.journeyLegTitleRow}><Text style={styles.journeyLegMode}>{modeDetail}</Text><Text style={styles.journeyLegDuration}>{minutes} min</Text></View>
                    <Text numberOfLines={2} style={styles.journeyLegStops}>{leg.from || (index === 0 ? routeOriginName : 'Continue')} <Text style={styles.journeyArrow}>→</Text> {leg.to || (index === activeRoute.legs.length - 1 ? destination.label : 'Next stop')}</Text>
                    <Text style={styles.journeyLegMeta}>{distance}{mode === 'walking' && typeof activeRoute.walkPm25 === 'number' ? ` · PM2.5 about ${Math.round(activeRoute.walkPm25)} µg/m³` : ''}</Text>
                  </View>
                </View>;
              })}
            </View>
            <View style={styles.journeyModeBreakdown}>
              {activeRouteModes.filter(item => item.used).map(({ mode, durationSeconds, distanceMeters }) => <View key={mode} style={styles.journeyModeItem}>
                <View style={[styles.routeMapHintDot, { backgroundColor: ROUTE_MODE_COLORS[mode] }]} /><Text style={styles.journeyModeText}>{ROUTE_MODE_LABELS[mode]} · {Math.max(1, Math.round(durationSeconds / 60))} min · {(distanceMeters / 1000).toFixed(1)} km</Text>
              </View>)}
            </View>
            {routes.length > 1 && <Text style={styles.journeyMapTip}>Tap another route on the map to compare its steps.</Text>}
          </ScrollView> : <View style={styles.journeyLoading}><Text style={styles.routeMapHintText}>Tap a colored route on the map to see its journey details.</Text></View>}
          {routeAdvice && routeAdvice.level !== 'ok' && activeRoute && <ScrollView style={styles.journeyAdviceScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}><View style={styles.exposureAdvice}>
            <Text style={styles.exposureAdviceHeading}>{routeAdvice.level === 'high' ? 'High outdoor exposure' : 'Elevated outdoor exposure'}</Text>
            {routeAdvice.reasons.map((reason, index) => <Text key={`reason-${index}`} style={styles.exposureAdviceText}>{reason}</Text>)}
            {routeAdvice.wait && <View style={styles.waitAdvice}>
              <Text style={styles.waitAdviceTitle}>{routeAdvice.wait.recommended ? `Wait ${routeAdvice.wait.waitMin ?? ''} min` : 'Waiting is not recommended'}</Text>
              <Text style={styles.exposureAdviceText}>{routeAdvice.wait.recommended
                ? `Cleaner departure${routeAdvice.wait.departAt ? ` at ${new Date(routeAdvice.wait.departAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}${typeof routeAdvice.wait.expectedExposureReductionPct === 'number' ? ` · about ${routeAdvice.wait.expectedExposureReductionPct}% less exposure` : ''}.`
                : routeAdvice.wait.reason || 'Later departures are not expected to improve this trip.'}</Text>
            </View>}
            {recommendedRides.map((ride, index) => {
              const quote = rideQuotes[index];
              const fareOptions = quote ? [
                ['Bike', quote.bike],
                ['Cab', quote.cabEconomy],
                ['Premium', quote.cabPremium],
                ['XL', quote.cabXl],
              ].filter((entry): entry is [string, NonNullable<RideQuote['bike']>] => entry[1] !== null) : [];
              const usableUrl = quote?.url?.startsWith('https://') ? quote.url : null;
              return <View key={`${ride.kind}-${index}`} style={styles.rideAdvice}>
                <Text style={styles.rideAdviceTitle}>{ride.kind === 'ride_rest' ? `Rapido from ${ride.pickup.name}` : 'Rapido from your location'}</Text>
                <Text style={styles.exposureAdviceText}>{ride.rideKm.toFixed(1)} km · about {Math.round(ride.rideMin)} min</Text>
                {ride.vsBest && <Text style={styles.rideBenefitText}>{ride.vsBest.exposureReductionPct}% less exposure · {ride.vsBest.timeSavedMin > 0 ? `${Math.round(ride.vsBest.timeSavedMin)} min faster` : `${Math.abs(Math.round(ride.vsBest.timeSavedMin))} min longer`}</Text>}
                {rideQuotesLoading && !quote && <Text style={styles.exposureAdviceText}>Getting current Rapido fares…</Text>}
                {quote && <View style={styles.rideFareList}>
                  {fareOptions.map(([label, fare]) => <Text key={label} style={styles.rideFare}>{label} {fareText(fare)}</Text>)}
                  {!!quote.note && <Text style={styles.fareNote}>{quote.note}</Text>}
                </View>}
                {!rideQuotesLoading && !quote && <Text style={styles.exposureAdviceText}>Rapido fare estimate is unavailable right now.</Text>}
                {usableUrl && <Pressable accessibilityRole="button" onPress={() => void openRapido(usableUrl)} style={({ pressed }) => [styles.rideAction, pressed && styles.pressed]}><Text style={styles.rideActionText}>Open in Rapido</Text></Pressable>}
              </View>;
            })}
            {routeAdvice.level === 'high' && !recommendedRides.length && <Text style={styles.exposureAdviceText}>No Rapido option meets the exposure and travel-time threshold for this trip.</Text>}
          </View></ScrollView>}
        </Animated.View>}

        {!!note && <Animated.View pointerEvents="none" style={[styles.notice, noteError && styles.noticeError, noticeAnimatedStyle]}><Text style={styles.noticeText}>{note}</Text></Animated.View>}

        {view === 'account' && <Pressable accessibilityRole="button" accessibilityLabel="Close account panel" disabled={accountClosing} onPress={closeAccount} style={styles.accountDismiss} />}

        <Animated.View pointerEvents={view === 'account' && !accountClosing ? 'auto' : 'none'} accessibilityElementsHidden={view !== 'account'} importantForAccessibility={view === 'account' ? 'auto' : 'no-hide-descendants'} style={[styles.accountPanel, wide && styles.accountPanelWide, accountMotionStyle, { height: Math.min(accountContentHeight || height * 0.76, height - 96) }]}>
            <ScrollView style={styles.accountScroll} contentContainerStyle={styles.accountContent} onContentSizeChange={(_, contentHeight) => setAccountContentHeight(contentHeight)} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.accountHeader}>
                <View><Text style={styles.accountEyebrow}>COOLCOMMUTE</Text><Text style={styles.accountHeading}>Your account</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close account" disabled={accountClosing} onPress={closeAccount} style={({ pressed }) => [styles.accountClose, pressed && styles.pressed]}><Text style={styles.accountCloseText}>×</Text></Pressable>
              </View>
            <Card title="Your data" index={0}>
              <Row label="Cloud sync" detail={profile?.synced ? 'Preferences are backed up to your account.' : 'Changes are saved on this device.'} action={profile?.synced ? undefined : (busy ? 'Syncing…' : 'Sync now')} onPress={() => void retrySync()} />
              <View style={styles.preferenceDivider} />
              <Row label="Export profile" detail="Copy a portable version of your commute preferences." action="Export" ghost onPress={() => void exportData()} />
              <View style={styles.preferenceDivider} />
              <Row label="Local storage" detail={`${cacheBytes} bytes of cached data on this device.`} action="Clear cache" ghost onPress={() => void removeJson('cache').then(refresh)} />
            </Card>
            <Card title="Privacy & location" index={1}>
              <Row label="Current area" detail={permission !== 'granted' ? 'Your live location is not available.' : liveLocationReady ? currentLabel : 'Finding your live location…'} />
              <View style={styles.preferenceDivider} />
              <Row label="Home area" detail={profile?.location ? (profile.locationLabel || 'Home location saved.') : 'No home location saved.'} />
              <View style={styles.preferenceDivider} />
              <Row label="Location permission" detail={permission === 'granted' ? 'Enabled for area-specific commute insights.' : 'Off. You can still search for a place.'} action={Platform.OS === 'web' ? undefined : 'Open settings'} ghost onPress={() => void Linking.openSettings()} />
              {Platform.OS !== 'web' && <>
                <View style={styles.preferenceDivider} />
                <Row label="Background location" detail={backgroundTracking ? 'On while you travel. Updates stay on this device and are not saved to history or sent to AWS.' : 'Off. Enable to keep location updates active during a commute. Android shows an ongoing system notification while active.'} action={busy ? 'Please wait' : backgroundTracking ? 'Turn off' : 'Enable'} ghost onPress={() => void toggleBackgroundTracking()} />
              </>}
              <View style={styles.preferenceDivider} />
              <Row label="Data storage" detail="Your profile is stored on this device and, when sync succeeds, in your AWS-backed account." />
            </Card>
            <Card title="Commute preferences" index={2}>
              {QUESTIONS.map((question, index) => <View key={question.key}>
                {index > 0 && <View style={styles.preferenceDivider} />}
                <Row label={question.title} detail={labelFor(question.key, profile?.[question.key])} action={editingQuestion === question.key ? 'Close' : 'Change'} ghost onPress={() => setEditingQuestion(editingQuestion === question.key ? null : question.key)} />
                <SmoothCollapse expanded={editingQuestion === question.key} style={styles.answerDropdown}>
                  {question.options.map(option => <Pressable key={option.value} accessibilityRole="button" disabled={busy} onPress={() => void updatePreference(question.key, option.value)} style={({ pressed }) => [styles.answerOption, profile?.[question.key] === option.value && styles.answerOptionSelected, pressed && styles.pressed, busy && styles.disabled]}>
                    <Text style={styles.answerOptionText}>{option.label}</Text>
                    {profile?.[question.key] === option.value && <Text style={styles.answerSelectedMark}>✓</Text>}
                  </Pressable>)}
                </SmoothCollapse>
              </View>)}
            </Card>
            <Card title="Account" index={2}>
              <Row label="Sign out" detail="You can sign back in at any time." action="Sign out" ghost onPress={logout} />
              <View style={styles.preferenceDivider} />
              <Row label="Delete account" detail="Permanently remove your account and saved preferences." action="Delete account" ghost onPress={() => setDeleteConfirmOpen(true)} />
            </Card>
            </ScrollView>
          </Animated.View>
      </View>

      {deleteConfirmOpen && <Animated.View style={styles.confirmRoot}>
        <Animated.View entering={FadeIn.duration(170)} style={StyleSheet.absoluteFill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel account deletion" style={styles.confirmBackdrop} onPress={() => !busy && setDeleteConfirmOpen(false)} />
        </Animated.View>
        <Animated.View entering={ZoomIn.springify().damping(19).stiffness(190)} style={styles.confirmDialog}>
          <View style={styles.confirmAnimation}><LottieSlot source={LOTTIE.shock} size={104} loop /></View>
          <Text style={styles.confirmTitle}>Delete your account?</Text>
          <Text style={styles.confirmMessage}>This permanently deletes your account and saved commute profile. You can’t undo this action.</Text>
          <View style={styles.confirmActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDeleteConfirmOpen(false)} style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.confirmCancelText}>Keep account</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void removeAccount()} style={({ pressed }) => [styles.confirmDelete, pressed && styles.pressed, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color="#fff5ef" size="small" /> : <Text style={styles.confirmDeleteText}>Delete account</Text>}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>}

      {locationAccessOpen && <Animated.View style={styles.locationAccessRoot}>
        <Animated.View entering={FadeIn.duration(170)} style={StyleSheet.absoluteFill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close location access prompt" style={styles.confirmBackdrop} onPress={() => { pendingLocationAction.current = null; setLocationAccessOpen(false); }} />
        </Animated.View>
        <Animated.View entering={ZoomIn.springify().damping(20).stiffness(190)} accessibilityViewIsModal style={styles.locationAccessDialog}>
          <View style={styles.locationAccessAnimation}><LottieSlot source={locationAccessGranted ? LOTTIE.locationGranted : LOTTIE.locationAsk} size={96} loop={!locationAccessGranted} /></View>
          <Text style={styles.locationAccessTitle}>{locationAccessGranted ? 'Location access granted' : 'Allow location access?'}</Text>
          {!locationAccessGranted && <>
            <Text accessibilityRole="alert" style={styles.locationAccessMessage}>{locationError || (permissionCanAskAgain || Platform.OS === 'web' ? 'Use your current location to center the map and plan a route to the destination you search for.' : 'Location access is turned off for CoolCommute. Enable it in your device settings to use your current location and search for destinations.')}</Text>
            <View style={styles.locationAccessActions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { pendingLocationAction.current = null; setLocationAccessOpen(false); }} style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.confirmCancelText}>Not now</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void allowLocationAccess()} style={({ pressed }) => [styles.confirmDelete, styles.locationAccessEnable, pressed && styles.pressed, busy && styles.disabled]}>
                {busy ? <ActivityIndicator color="#fff5ef" size="small" /> : <Text style={styles.confirmDeleteText}>{permissionCanAskAgain || Platform.OS === 'web' ? 'Allow location' : 'Open settings'}</Text>}
              </Pressable>
            </View>
          </>}
        </Animated.View>
      </Animated.View>}

      {demoOriginDialogOpen && <Animated.View style={styles.demoOriginRoot}>
        <Animated.View entering={FadeIn.duration(170)} style={StyleSheet.absoluteFill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Delhi demo location picker" style={styles.confirmBackdrop} onPress={() => setDemoOriginDialogOpen(false)} />
        </Animated.View>
        <Animated.View entering={ZoomIn.springify().damping(20).stiffness(190)} accessibilityViewIsModal style={styles.demoOriginDialog}>
          <View style={styles.demoOriginAnimation}><LottieSlot source={LOTTIE.sorry} size={104} loopSegment={[0, 48]} /></View>
          <Text style={styles.demoOriginTitle}>Oops, we’re not in your area yet</Text>
          <Text style={styles.demoOriginCopy}>CoolCommute is currently testing in Delhi. Choose a Delhi starting place by name to try a route.</Text>
          <View style={styles.demoOriginSearch}>
            <Text style={styles.searchGlyph}>⌕</Text>
            <TextInput accessibilityLabel="Search for a Delhi demo starting place" value={demoOriginQuery} onChangeText={setDemoOriginQuery} placeholder="Search a place in Delhi" placeholderTextColor="#aab4aa" returnKeyType="search" style={styles.searchInput} />
            {demoOriginLoading && <ActivityIndicator size="small" color="#c9d98f" />}
          </View>
          {demoOriginSuggestions.length > 0 && <ScrollView style={styles.demoOriginSuggestionList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {demoOriginSuggestions.map((suggestion, index) => <Pressable key={`${suggestion.place.lng}:${suggestion.place.lat}:${index}`} accessibilityRole="button" onPress={() => chooseDemoOrigin(suggestion)} style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionPressed]}>
              <Text style={styles.suggestionGlyph}>⌖</Text><Text numberOfLines={2} style={styles.suggestionText}>{suggestion.label}</Text>
            </Pressable>)}
          </ScrollView>}
          {demoOriginQuery.trim().length >= 2 && !demoOriginLoading && !demoOriginSuggestions.length && <Text style={styles.demoOriginEmpty}>No Delhi places found. Try a landmark, address, or neighborhood.</Text>}
          <Text style={styles.demoOriginFootnote}>This demo starting point will not replace your live location.</Text>
          <Pressable accessibilityRole="button" onPress={() => setDemoOriginDialogOpen(false)} style={({ pressed }) => [styles.demoOriginClose, pressed && styles.pressed]}><Text style={styles.demoOriginCloseText}>Not now</Text></Pressable>
        </Animated.View>
      </Animated.View>}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: adapt('#fbf5f7', '#101813'), overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', pointerEvents: 'box-none' },
  topArea: { paddingTop: Platform.OS === 'web' ? 18 : 16, paddingHorizontal: 16, gap: 11 },
  topAreaWide: { paddingTop: 26, paddingHorizontal: 28, gap: 15 },
  menuButton: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: adapt('rgba(255,253,253,0.97)', 'rgba(13,23,17,0.96)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.16)', 'rgba(222,231,210,0.16)') },
  menuLine: { width: 19, height: 2, borderRadius: 1, backgroundColor: adapt('#261b1f', '#e5eadf') },
  menuPanel: { position: 'absolute', zIndex: 40, elevation: 20, top: Platform.OS === 'web' ? 77 : 73, left: 16, minWidth: 220, padding: 7, borderRadius: 16, backgroundColor: adapt('rgba(255,253,253,0.99)', 'rgba(18,29,22,0.98)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.17)', 'rgba(222,231,210,0.17)') },
  menuPanelWide: { left: 28 },
  menuItem: { minHeight: 43, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
  menuItemText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 13, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 670 },
  searchContainer: { maxWidth: 670, zIndex: 20 },
  searchField: { flex: 1, minWidth: 0, height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 15, backgroundColor: adapt('rgba(255,253,253,0.98)', 'rgba(13,23,17,0.97)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.16)', 'rgba(222,231,210,0.16)') },
  searchGlyph: { color: adapt('#a95f77', '#c3d19c'), fontSize: 23, lineHeight: 26 },
  searchInput: { flex: 1, color: adapt('#211a1d', '#f0f2e8'), fontSize: 14, paddingVertical: 0, outlineStyle: 'none' } as object,
  searchButton: { height: 48, minWidth: 86, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 15, backgroundColor: adapt('#bd788e', '#c9d98f') },
  searchButtonDisabled: { backgroundColor: adapt('#e6cbd4', '#657052') },
  searchButtonText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 13, fontWeight: '700' },
  searchButtonTextDisabled: { color: adapt('#6d5d63', '#e0e6d0') },
  suggestionsPanel: { marginTop: 6, overflow: 'hidden', borderRadius: 15, backgroundColor: adapt('rgba(255,253,253,0.99)', 'rgba(18,29,22,0.98)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.17)', 'rgba(222,231,210,0.17)'), shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  suggestionItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: adapt('rgba(139,83,101,0.08)', 'rgba(222,231,210,0.09)') },
  suggestionPressed: { backgroundColor: adapt('rgba(206,144,165,0.1)', 'rgba(205,222,151,0.11)') },
  suggestionGlyph: { color: adapt('#bd788e', '#c9d98f'), fontSize: 19, width: 20, textAlign: 'center' },
  suggestionText: { flex: 1, color: adapt('#261b1f', '#e5eadf'), fontSize: 13, lineHeight: 18 },
  suggestionMessage: { paddingHorizontal: 15, paddingVertical: 14, color: adapt('#81747a', '#aab4aa'), fontSize: 12 },
  locateButton: { alignSelf: 'flex-start', height: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 13, backgroundColor: adapt('rgba(255,253,253,0.96)', 'rgba(20,31,24,0.91)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.15)', 'rgba(222,231,210,0.15)') },
  locateGlyph: { color: adapt('#a95f77', '#c3d19c'), fontSize: 20, lineHeight: 22 },
  locateText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 12, fontWeight: '600' },
  demoOriginPill: { alignSelf: 'flex-start', maxWidth: 360, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: adapt('rgba(252,243,247,0.98)', 'rgba(36,29,58,0.96)'), borderWidth: 1, borderColor: adapt('rgba(169,95,119,0.34)', 'rgba(154,134,232,0.38)') },
  demoOriginPillText: { color: adapt('#725368', '#e3dcff'), fontSize: 10, fontWeight: '700' },
  journeyPanel: { position: 'absolute', bottom: Platform.OS === 'web' ? 22 : 16, left: 16, overflow: 'hidden', borderRadius: 20, backgroundColor: adapt('rgba(255,253,253,0.97)', 'rgba(13,23,17,0.96)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.17)', 'rgba(222,231,210,0.17)'), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  journeyPanelHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: adapt('rgba(139,83,101,0.1)', 'rgba(222,231,210,0.1)') },
  journeyPanelHeadingCopy: { flex: 1, minWidth: 0 },
  journeyEyebrow: { color: adapt('#81747a', '#aab4aa'), fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  journeyDestination: { color: adapt('#261b1f', '#e5eadf'), fontSize: 15, fontWeight: '700' },
  journeyLoading: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  journeyScroll: { flexShrink: 1 },
  journeyContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  journeySummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: adapt('rgba(139,83,101,0.1)', 'rgba(222,231,210,0.1)') },
  journeyTotal: { color: adapt('#211a1d', '#f0f2e8'), fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  journeyTotalUnit: { fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  journeySummaryCaption: { marginTop: 3, color: adapt('#62545a', '#c2cbbf'), fontSize: 12, fontWeight: '600' },
  journeyTimeRange: { marginTop: 5, color: adapt('#51464a', '#d5dfd1'), fontSize: 12, fontWeight: '700' },
  journeyPlaces: { flexDirection: 'row', alignItems: 'stretch', gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: adapt('rgba(139,83,101,0.1)', 'rgba(222,231,210,0.1)') },
  journeyPlaceMarker: { width: 12, alignItems: 'center', paddingVertical: 3 },
  journeyStartDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: '#8bd7c3', backgroundColor: adapt('#fff7f9', '#122019') },
  journeyPlaceRule: { flex: 1, width: 1, marginVertical: 3, backgroundColor: adapt('rgba(139,83,101,0.25)', 'rgba(222,231,210,0.3)') },
  journeyEndDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#e88a72' },
  journeyPlaceLabels: { flex: 1, justifyContent: 'space-between', gap: 10 },
  journeyPlaceText: { color: adapt('#51464a', '#d5dfd1'), fontSize: 12, lineHeight: 18, fontWeight: '600' },
  journeySectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 3 },
  journeySectionTitle: { color: adapt('#261b1f', '#e5eadf'), fontSize: 14, fontWeight: '800' },
  journeySectionMeta: { color: adapt('#73666b', '#b1bcae'), fontSize: 11, fontWeight: '600' },
  journeyLegList: { marginTop: 8 },
  journeyLegRow: { minHeight: 68, flexDirection: 'row', gap: 11 },
  journeyLegRail: { width: 12, alignItems: 'center' },
  journeyLegDot: { width: 9, height: 9, marginTop: 4, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  journeyLegConnector: { flex: 1, width: 2, marginTop: 3, marginBottom: -1, backgroundColor: adapt('rgba(139,83,101,0.2)', 'rgba(222,231,210,0.2)') },
  journeyLegCopy: { flex: 1, paddingBottom: 15 },
  journeyLegTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  journeyLegMode: { color: adapt('#261b1f', '#e5eadf'), fontSize: 13, fontWeight: '800' },
  journeyLegDuration: { color: adapt('#8b4d66', '#d2dda9'), fontSize: 13, fontWeight: '800' },
  journeyLegStops: { marginTop: 5, color: adapt('#51464a', '#d5dfd1'), fontSize: 12, lineHeight: 17 },
  journeyArrow: { color: adapt('#81747a', '#aab4aa'), fontWeight: '800' },
  journeyLegMeta: { marginTop: 4, color: adapt('#73666b', '#b1bcae'), fontSize: 11, fontWeight: '600' },
  journeyModeBreakdown: { gap: 7, marginTop: 3, paddingTop: 11, borderTopWidth: 1, borderTopColor: adapt('rgba(139,83,101,0.1)', 'rgba(222,231,210,0.1)') },
  journeyModeItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  journeyModeText: { color: adapt('#62545a', '#c2cbbf'), fontSize: 11, fontWeight: '600' },
  journeyMapTip: { marginTop: 11, color: adapt('#73666b', '#b1bcae'), fontSize: 11, lineHeight: 16 },
  journeyAdviceScroll: { flexShrink: 1, maxHeight: 180, paddingHorizontal: 16 },
  routeHintHeading: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  routeHintTotal: { color: adapt('#211a1d', '#f0f2e8'), fontSize: 14, fontWeight: '800' },
  routeHintRecommended: { marginLeft: 'auto', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: adapt('rgba(206,144,165,0.16)', 'rgba(201,217,143,0.16)'), color: adapt('#995d73', '#d5e69b'), fontSize: 9, fontWeight: '800' },
  routeHintTags: { marginBottom: 7, color: adapt('#73666b', '#b1bcae'), fontSize: 9, fontWeight: '700', textTransform: 'capitalize' },
  routeMapHintText: { flexShrink: 1, color: adapt('#66585d', '#d5dfd1'), fontSize: 11, fontWeight: '600' },
  routeModeBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  routeModeChip: { flexGrow: 1, minWidth: 115, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: adapt('rgba(206,144,165,0.07)', 'rgba(255,255,255,0.045)') },
  routeModeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  routeModeName: { color: adapt('#51464a', '#d5dfd1'), fontSize: 9, fontWeight: '800' },
  routeModeAmount: { marginTop: 3, color: adapt('#81747a', '#aab4aa'), fontSize: 9, fontWeight: '600' },
  routeMapHintDot: { width: 7, height: 7, borderRadius: 4 },
  exposureAdvice: { marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: adapt('rgba(139,83,101,0.13)', 'rgba(222,231,210,0.13)'), gap: 5 },
  exposureAdviceHeading: { color: '#8b6826', fontSize: 11, fontWeight: '800' },
  exposureAdviceText: { color: adapt('#73666b', '#b1bcae'), fontSize: 10, lineHeight: 14 },
  waitAdvice: { marginTop: 3, padding: 8, borderRadius: 10, backgroundColor: adapt('rgba(206,144,165,0.07)', 'rgba(255,255,255,0.045)'), gap: 3 },
  waitAdviceTitle: { color: adapt('#51464a', '#d5dfd1'), fontSize: 10, fontWeight: '800' },
  rideAdvice: { marginTop: 3, padding: 8, borderRadius: 10, backgroundColor: adapt('rgba(206,144,165,0.08)', 'rgba(76,201,166,0.08)'), borderWidth: 1, borderColor: adapt('rgba(206,144,165,0.2)', 'rgba(76,201,166,0.2)'), gap: 4 },
  rideAdviceTitle: { color: adapt('#51464a', '#d5dfd1'), fontSize: 10, fontWeight: '800' },
  rideBenefitText: { color: '#34785b', fontSize: 10, fontWeight: '700' },
  rideFareList: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  rideFare: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: adapt('rgba(206,144,165,0.12)', 'rgba(255,255,255,0.08)'), color: adapt('#51464a', '#d5dfd1'), fontSize: 9, fontWeight: '700' },
  fareNote: { flexBasis: '100%', color: adapt('#81747a', '#aab4aa'), fontSize: 8, lineHeight: 11 },
  rideAction: { minHeight: 32, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 9, backgroundColor: adapt('#bd788e', '#c9d98f') },
  rideActionText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 10, fontWeight: '800' },
  pressed: { opacity: 0.74 },
  disabled: { opacity: 0.48 },
  notice: { position: 'absolute', bottom: Platform.OS === 'web' ? 24 : 20, left: 16, right: 16, alignSelf: 'center', maxWidth: 620, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 14, backgroundColor: adapt('rgba(255,253,253,0.98)', 'rgba(13,23,17,0.97)'), borderWidth: 1, borderColor: adapt('rgba(169,95,119,0.24)', 'rgba(195,215,145,0.22)') },
  noticeError: { backgroundColor: adapt('rgba(255,247,246,0.99)', 'rgba(56,37,31,0.97)'), borderColor: 'rgba(229,138,114,0.28)' },
  noticeText: { color: adapt('#51464a', '#d5dfd1'), fontSize: 13, lineHeight: 19 },
  card: { paddingHorizontal: 15, paddingVertical: 3, borderRadius: 19, borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.12)', 'rgba(229,237,220,0.12)'), backgroundColor: adapt('rgba(255,253,253,0.98)', 'rgba(13,23,17,0.97)') },
  cardHeader: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { flex: 1, color: adapt('#261b1f', '#e5eadf'), fontSize: 14, fontWeight: '700' },
  cardChevron: { width: 25, color: adapt('#bd788e', '#c9d98f'), textAlign: 'center', fontSize: 24, lineHeight: 27 },
  cardBodyClip: { overflow: 'hidden' },
  cardBody: { paddingBottom: 12 },
  accountDismiss: { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  accountPanel: { position: 'absolute', zIndex: 31, top: Platform.OS === 'web' ? 78 : 66, left: 14, right: 14, overflow: 'hidden', borderRadius: 24, backgroundColor: adapt('rgba(255,253,253,0.98)', 'rgba(13,23,17,0.97)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.18)', 'rgba(226,235,214,0.18)'), shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
  accountPanelWide: { top: 82, left: undefined, right: 28, width: 440 },
  accountScroll: { flex: 1 },
  accountContent: { padding: 15, paddingBottom: 19, gap: 11 },
  accountHeader: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginBottom: 2 },
  accountEyebrow: { color: adapt('#81747a', '#aab4aa'), fontSize: 8, fontWeight: '700', letterSpacing: 1.3, marginBottom: 3 },
  accountHeading: { color: adapt('#211a1d', '#f0f2e8'), fontSize: 21, fontWeight: '700' },
  accountClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: adapt('rgba(139,83,101,0.06)', 'rgba(229,237,220,0.08)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.12)', 'rgba(229,237,220,0.12)') },
  accountCloseText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 23, lineHeight: 25, fontWeight: '400' },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  accountRowCopy: { flex: 1 },
  accountLabel: { color: adapt('#261b1f', '#e5eadf'), fontSize: 13, fontWeight: '600' },
  accountDetail: { color: adapt('#73666b', '#b1bcae'), fontSize: 11, lineHeight: 16, marginTop: 4 },
  accountAction: { width: 132 },
  preferenceDivider: { height: 1, backgroundColor: adapt('rgba(139,83,101,0.1)', 'rgba(222,231,210,0.1)'), marginVertical: 9 },
  answerDropdown: { gap: 2, marginTop: 8, marginBottom: 10, padding: 7, borderRadius: 13, borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.13)', 'rgba(222,231,210,0.13)'), backgroundColor: adapt('rgba(255,249,251,0.96)', 'rgba(13,23,17,0.58)') },
  answerOption: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9 },
  answerOptionSelected: { borderColor: adapt('rgba(169,95,119,0.42)', 'rgba(201,217,143,0.55)'), backgroundColor: adapt('rgba(206,144,165,0.13)', 'rgba(201,217,143,0.13)') },
  answerOptionText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 12, lineHeight: 17 },
  answerSelectedMark: { marginLeft: 10, color: adapt('#bd788e', '#c9d98f'), fontSize: 14, fontWeight: '700' },
  confirmRoot: { ...StyleSheet.absoluteFillObject, zIndex: 1000, alignItems: 'center', justifyContent: 'center', padding: 22 },
  confirmBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,9,6,0.72)' },
  confirmDialog: { width: '100%', maxWidth: 390, padding: 22, borderRadius: 24, backgroundColor: adapt('#fffdfd', '#142119'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.19)', 'rgba(226,235,214,0.19)'), shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  confirmAnimation: { width: 104, height: 104, alignSelf: 'center', marginTop: -9, marginBottom: 4 },
  confirmTitle: { color: adapt('#211a1d', '#f0f2e8'), fontSize: 20, fontWeight: '700', marginTop: 17 },
  confirmMessage: { color: adapt('#73666b', '#b1bcae'), fontSize: 13, lineHeight: 20, marginTop: 8 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 23 },
  confirmCancel: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: adapt('rgba(139,83,101,0.05)', 'rgba(225,235,219,0.07)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.12)', 'rgba(229,237,220,0.12)') },
  confirmCancelText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 13, fontWeight: '700' },
  confirmDelete: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#b94f3d', borderWidth: 1, borderColor: 'rgba(255,227,218,0.2)' },
  confirmDeleteText: { color: '#fff7f1', fontSize: 13, fontWeight: '700' },
  locationAccessRoot: { ...StyleSheet.absoluteFillObject, zIndex: 1001, alignItems: 'center', justifyContent: 'center', padding: 22 },
  locationAccessDialog: { width: '100%', maxWidth: 390, padding: 22, borderRadius: 24, backgroundColor: adapt('#fffdfd', '#142119'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.19)', 'rgba(226,235,214,0.19)'), shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  locationAccessAnimation: { width: 96, height: 96, alignSelf: 'center', marginTop: -8, marginBottom: 4 },
  locationAccessTitle: { color: adapt('#211a1d', '#f0f2e8'), fontSize: 20, fontWeight: '700', marginTop: 15, textAlign: 'center' },
  locationAccessMessage: { color: adapt('#73666b', '#b1bcae'), fontSize: 13, lineHeight: 20, marginTop: 9, textAlign: 'center' },
  locationAccessActions: { flexDirection: 'row', gap: 10, marginTop: 23 },
  locationAccessEnable: { backgroundColor: adapt('#e9d2da', '#71804f'), borderColor: adapt('rgba(206,144,165,0.34)', 'rgba(201,217,143,0.35)') },
  demoOriginRoot: { ...StyleSheet.absoluteFillObject, zIndex: 1002, alignItems: 'center', justifyContent: 'center', padding: 22 },
  demoOriginDialog: { width: '100%', maxWidth: 420, maxHeight: '88%', padding: 20, borderRadius: 24, backgroundColor: adapt('#fffdfd', '#142119'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.19)', 'rgba(226,235,214,0.19)'), shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  demoOriginAnimation: { width: 104, height: 104, alignSelf: 'center', marginTop: -8, marginBottom: 4 },
  demoOriginTitle: { color: adapt('#211a1d', '#f0f2e8'), fontSize: 20, lineHeight: 25, fontWeight: '800' },
  demoOriginCopy: { marginTop: 8, color: adapt('#73666b', '#b1bcae'), fontSize: 13, lineHeight: 19 },
  demoOriginSearch: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 12, borderRadius: 13, backgroundColor: adapt('rgba(255,253,253,0.98)', 'rgba(13,23,17,0.97)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.18)', 'rgba(226,235,214,0.18)') },
  demoOriginSuggestionList: { maxHeight: 250, marginTop: 7, overflow: 'hidden', borderRadius: 13, borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.14)', 'rgba(222,231,210,0.14)'), backgroundColor: adapt('rgba(255,253,253,0.99)', 'rgba(18,29,22,0.98)') },
  demoOriginEmpty: { paddingVertical: 12, color: adapt('#73666b', '#b1bcae'), fontSize: 11, lineHeight: 16 },
  demoOriginFootnote: { marginTop: 13, color: adapt('#81747a', '#aab4aa'), fontSize: 10, lineHeight: 15 },
  demoOriginClose: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 12, backgroundColor: adapt('rgba(139,83,101,0.05)', 'rgba(225,235,219,0.07)'), borderWidth: 1, borderColor: adapt('rgba(139,83,101,0.12)', 'rgba(229,237,220,0.12)') },
  demoOriginCloseText: { color: adapt('#261b1f', '#e5eadf'), fontSize: 12, fontWeight: '700' },
});
