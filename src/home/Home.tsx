import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeOutLeft, ZoomIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { deleteAccount, getCurrentUsername, getIdToken, signOut } from '../auth/cognito';
import { Button } from '../components/Button';
import { LOTTIE, LottieSlot } from '../components/Lottie';
import { CommuteMap } from '../dashboard/CommuteMap';
import { LocationResult, searchLocation, searchLocations } from '../dashboard/locationSearch';
import { removeJson, sizeOf } from '../data/localStore';
import { Place, Profile, deleteRemoteProfile, loadProfile, removeProfile, saveProfile, uploadProfile } from '../data/profile';
import { labelFor, QUESTIONS, QuestionKey } from '../data/questions';
import { getBackgroundLocationRunning, startBackgroundLocation, stopBackgroundLocation, subscribeToBackgroundLocations } from '../location/backgroundLocationTask';

type ViewName = 'today' | 'account';

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
  const [mapLabel, setMapLabel] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [accountContentHeight, setAccountContentHeight] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionKey | null>(null);
  const [permission, setPermission] = useState('undetermined');
  const [liveLocationReady, setLiveLocationReady] = useState(false);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [backgroundTrackingError, setBackgroundTrackingError] = useState('');
  const [trackingKey, setTrackingKey] = useState(0);
  const [initial, setInitial] = useState('Y');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<LocationResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [currentLabel, setCurrentLabel] = useState('Location not set');

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
      setPermission((await Location.getForegroundPermissionsAsync()).status);
    } catch {
      setPermission('undetermined');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (permission !== 'granted') return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    const applyPosition = (position: Location.LocationObject) => {
      const accuracy = position.coords.accuracy;
      if (accuracy === null || !Number.isFinite(accuracy) || cancelled) return;
      setMapLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      setMapAccuracy(accuracy);
      setMapLabel('Your current area');
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      setCurrentLabel(`${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`);
      setLiveLocationReady(true);
      setLocationError('');
    };
    const unsubscribeBackground = backgroundTracking ? subscribeToBackgroundLocations(applyPosition) : null;
    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }).then(applyPosition).catch(() => {});
    if (!backgroundTracking) {
      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2500, distanceInterval: 5 },
        applyPosition,
      ).then(nextSubscription => {
        if (cancelled) nextSubscription.remove();
        else subscription = nextSubscription;
      }).catch(error => {
        if (!cancelled) setLocationError((error as Error).message || 'Could not update your current location.');
      });
    }
    return () => {
      cancelled = true;
      subscription?.remove();
      unsubscribeBackground?.();
    };
  }, [backgroundTracking, permission, trackingKey]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(''), noteError ? 5200 : 3600);
    return () => clearTimeout(timer);
  }, [note, noteError]);

  useEffect(() => {
    const normalized = query.trim();
    if (view !== 'today' || normalized.length < 3) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let active = true;
    setSuggestions([]);
    setSuggestionsLoading(true);
    const timer = setTimeout(() => {
      void searchLocations(normalized, 5, true).then(results => {
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
  }, [query, view]);

  const showNote = (message: string, error = false) => {
    setNote(message);
    setNoteError(error);
  };

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

  const locate = async () => {
    setBusy(true);
    setLocationError('');
    setNote('');
    try {
      const permissionResult = await Location.requestForegroundPermissionsAsync();
      setPermission(permissionResult.status);
      if (permissionResult.status !== 'granted') throw new Error('Allow location access in Settings to use your current area.');
      setTrackingKey(value => value + 1);
    } catch (error) {
      setLocationError((error as Error).message || 'Could not read your current location.');
    } finally {
      setBusy(false);
    }
  };

  const toggleBackgroundTracking = async () => {
    if (busy) return;
    setBusy(true);
    setBackgroundTrackingError('');
    try {
      if (backgroundTracking) {
        await stopBackgroundLocation();
        setBackgroundTracking(false);
      } else {
        const enabled = await startBackgroundLocation();
        setBackgroundTracking(enabled);
        if (!enabled) setBackgroundTrackingError('Background access was not enabled. You can keep using location while the app is open.');
      }
    } catch (error) {
      setBackgroundTrackingError((error as Error).message || 'Could not update background location access.');
    } finally {
      setBusy(false);
    }
  };

  const submitSearch = async () => {
    setBusy(true);
    showNote('');
    try {
      const result = await searchLocation(query);
      setDestination(result);
      setSuggestions([]);
      setNote('');
      setQuery('');
    } catch (error) {
      showNote((error as Error).message || 'Could not find that location.', true);
    } finally {
      setBusy(false);
    }
  };

  const chooseDestination = (result: LocationResult) => {
    setDestination(result);
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

  return (
    <View style={styles.root}>
      <CommuteMap location={mapLocation ?? null} locationAccuracy={mapAccuracy} destination={destination?.place ?? null} initial={initial} />
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
                    <TextInput accessibilityLabel="Search for a city or neighborhood" value={query} onChangeText={setQuery} onSubmitEditing={() => void submitSearch()} placeholder="Search a city or neighborhood" placeholderTextColor="#aab4aa" returnKeyType="search" style={styles.searchInput} />
                  </View>
                  <Pressable disabled={busy || !query.trim()} onPress={() => void submitSearch()} style={({ pressed }) => [styles.searchButton, (busy || !query.trim()) && styles.searchButtonDisabled, pressed && styles.pressed]}><Text style={[styles.searchButtonText, (busy || !query.trim()) && styles.searchButtonTextDisabled]}>{busy ? '…' : 'Search'}</Text></Pressable>
                </View>
                {!suggestionsLoading && (suggestions.length > 0 || query.trim().length >= 3) && <View style={styles.suggestionsPanel}>
                  {suggestions.length ? suggestions.map((suggestion, index) => <Pressable key={`${suggestion.place.lng}:${suggestion.place.lat}:${index}`} accessibilityRole="button" onPress={() => chooseDestination(suggestion)} style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionPressed]}><Text style={styles.suggestionGlyph}>⌖</Text><Text numberOfLines={2} style={styles.suggestionText}>{suggestion.label}</Text></Pressable>) : <Text style={styles.suggestionMessage}>No places found</Text>}
                </View>}
              </View>
              {(permission !== 'granted' || !!locationError) && <Pressable accessibilityRole="button" accessibilityLabel="Use my location" disabled={busy} onPress={() => void locate()} style={({ pressed }) => [styles.locateButton, pressed && styles.pressed]}><Text style={styles.locateGlyph}>◎</Text><Text style={styles.locateText}>{busy ? 'Updating location…' : 'Use my location'}</Text></Pressable>}
              {!!locationError && <Text accessibilityRole="alert" style={styles.locationError}>{locationError}</Text>}
            </>
          ) : null}
        </View>

        {!!note && <Animated.View key={note} entering={FadeInRight.duration(260)} exiting={FadeOutLeft.duration(320)} style={[styles.notice, noteError && styles.noticeError]}><Text style={styles.noticeText}>{note}</Text></Animated.View>}

        {view === 'account' && <Pressable accessibilityRole="button" accessibilityLabel="Close account panel" disabled={accountClosing} onPress={closeAccount} style={styles.accountDismiss} />}

        <Animated.View pointerEvents={view === 'account' && !accountClosing ? 'auto' : 'none'} accessibilityElementsHidden={view !== 'account'} importantForAccessibility={view === 'account' ? 'auto' : 'no-hide-descendants'} style={[styles.accountPanel, wide && styles.accountPanelWide, accountMotionStyle, { height: Math.min(accountContentHeight || height * 0.76, height - 112) }]}>
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
                <Row label="Background location" detail={backgroundTrackingError || (backgroundTracking ? 'On while you travel. Updates stay on this device and are not saved to history or sent to AWS.' : 'Off. Enable to keep location updates active during a commute. Android shows an ongoing system notification while active.')} action={busy ? 'Please wait' : backgroundTracking ? 'Turn off' : 'Enable'} ghost onPress={() => void toggleBackgroundTracking()} />
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
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: '#101813', overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', pointerEvents: 'box-none' },
  topArea: { paddingTop: Platform.OS === 'web' ? 18 : 16, paddingHorizontal: 16, gap: 11 },
  topAreaWide: { paddingTop: 26, paddingHorizontal: 28, gap: 15 },
  menuButton: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(20,31,24,0.94)', borderWidth: 1, borderColor: 'rgba(222,231,210,0.16)' },
  menuLine: { width: 19, height: 2, borderRadius: 1, backgroundColor: '#e6eadf' },
  menuPanel: { position: 'absolute', zIndex: 40, elevation: 20, top: Platform.OS === 'web' ? 77 : 73, left: 16, minWidth: 220, padding: 7, borderRadius: 16, backgroundColor: 'rgba(18,29,22,0.98)', borderWidth: 1, borderColor: 'rgba(222,231,210,0.17)' },
  menuPanelWide: { left: 28 },
  menuItem: { minHeight: 43, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
  menuItemText: { color: '#e7ecdf', fontSize: 13, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 670 },
  searchContainer: { maxWidth: 670, zIndex: 20 },
  searchField: { flex: 1, minWidth: 0, height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 15, backgroundColor: 'rgba(16,26,20,0.99)', borderWidth: 1, borderColor: 'rgba(222,231,210,0.16)' },
  searchGlyph: { color: '#c3d19c', fontSize: 23, lineHeight: 26 },
  searchInput: { flex: 1, color: '#f2f3eb', fontSize: 14, paddingVertical: 0, outlineStyle: 'none' } as object,
  searchButton: { height: 48, minWidth: 86, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 15, backgroundColor: '#c9d98f' },
  searchButtonDisabled: { backgroundColor: '#657052' },
  searchButtonText: { color: '#1c281c', fontSize: 13, fontWeight: '700' },
  searchButtonTextDisabled: { color: '#e0e6d0' },
  suggestionsPanel: { marginTop: 6, overflow: 'hidden', borderRadius: 15, backgroundColor: 'rgba(18,29,22,0.98)', borderWidth: 1, borderColor: 'rgba(222,231,210,0.17)', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  suggestionItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(222,231,210,0.09)' },
  suggestionPressed: { backgroundColor: 'rgba(205,222,151,0.11)' },
  suggestionGlyph: { color: '#c9d98f', fontSize: 19, width: 20, textAlign: 'center' },
  suggestionText: { flex: 1, color: '#e7ecdf', fontSize: 13, lineHeight: 18 },
  suggestionMessage: { paddingHorizontal: 15, paddingVertical: 14, color: '#aab4aa', fontSize: 12 },
  locateButton: { alignSelf: 'flex-start', height: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 13, backgroundColor: 'rgba(20,31,24,0.91)', borderWidth: 1, borderColor: 'rgba(222,231,210,0.15)' },
  locateGlyph: { color: '#d1df9d', fontSize: 20, lineHeight: 22 },
  locateText: { color: '#e5eadf', fontSize: 12, fontWeight: '600' },
  locationError: { maxWidth: 320, marginTop: 7, color: '#f0a38f', fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.74 },
  disabled: { opacity: 0.48 },
  notice: { position: 'absolute', top: 190, left: 16, right: 16, alignSelf: 'center', maxWidth: 620, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(31,48,35,0.97)', borderWidth: 1, borderColor: 'rgba(195,215,145,0.22)' },
  noticeError: { backgroundColor: 'rgba(56,37,31,0.97)', borderColor: 'rgba(229,138,114,0.28)' },
  noticeText: { color: '#e0e8d1', fontSize: 13, lineHeight: 19 },
  card: { paddingHorizontal: 15, paddingVertical: 3, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(222,231,210,0.12)', backgroundColor: 'rgba(25,39,30,0.83)' },
  cardHeader: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { flex: 1, color: '#e8ebdf', fontSize: 14, fontWeight: '700' },
  cardChevron: { width: 25, color: '#c9d98f', textAlign: 'center', fontSize: 24, lineHeight: 27 },
  cardBodyClip: { overflow: 'hidden' },
  cardBody: { paddingBottom: 12 },
  accountDismiss: { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  accountPanel: { position: 'absolute', zIndex: 31, top: Platform.OS === 'web' ? 78 : 66, left: 14, right: 14, overflow: 'hidden', borderRadius: 24, backgroundColor: 'rgba(13,23,17,0.97)', borderWidth: 1, borderColor: 'rgba(226,235,214,0.18)', shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 14 },
  accountPanelWide: { top: 82, left: undefined, right: 28, width: 440 },
  accountScroll: { flex: 1 },
  accountContent: { padding: 15, paddingBottom: 19, gap: 11 },
  accountHeader: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginBottom: 2 },
  accountEyebrow: { color: '#aab79f', fontSize: 8, fontWeight: '700', letterSpacing: 1.3, marginBottom: 3 },
  accountHeading: { color: '#f1f2e9', fontSize: 21, fontWeight: '700' },
  accountClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(229,237,220,0.08)', borderWidth: 1, borderColor: 'rgba(229,237,220,0.12)' },
  accountCloseText: { color: '#e5eadf', fontSize: 23, lineHeight: 25, fontWeight: '400' },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  accountRowCopy: { flex: 1 },
  accountLabel: { color: '#e8ebdf', fontSize: 13, fontWeight: '600' },
  accountDetail: { color: '#b1bcae', fontSize: 11, lineHeight: 16, marginTop: 4 },
  accountAction: { width: 132 },
  preferenceDivider: { height: 1, backgroundColor: 'rgba(224,232,213,0.1)', marginVertical: 9 },
  answerDropdown: { gap: 2, marginTop: 8, marginBottom: 10, padding: 5, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(222,231,210,0.13)', backgroundColor: 'rgba(13,23,17,0.58)' },
  answerOption: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9 },
  answerOptionSelected: { borderColor: 'rgba(201,217,143,0.55)', backgroundColor: 'rgba(201,217,143,0.13)' },
  answerOptionText: { color: '#e7ecdf', fontSize: 12, lineHeight: 17 },
  answerSelectedMark: { marginLeft: 10, color: '#c9d98f', fontSize: 14, fontWeight: '700' },
  confirmRoot: { ...StyleSheet.absoluteFillObject, zIndex: 1000, alignItems: 'center', justifyContent: 'center', padding: 22 },
  confirmBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,9,6,0.72)' },
  confirmDialog: { width: '100%', maxWidth: 390, padding: 22, borderRadius: 24, backgroundColor: '#142119', borderWidth: 1, borderColor: 'rgba(226,235,214,0.19)', shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  confirmAnimation: { width: 104, height: 104, alignSelf: 'center', marginTop: -9, marginBottom: 4 },
  confirmTitle: { color: '#f1f2e9', fontSize: 20, fontWeight: '700', marginTop: 17 },
  confirmMessage: { color: '#b5c0b3', fontSize: 13, lineHeight: 20, marginTop: 8 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 23 },
  confirmCancel: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(225,235,219,0.07)', borderWidth: 1, borderColor: 'rgba(225,235,219,0.12)' },
  confirmCancelText: { color: '#e5eadf', fontSize: 13, fontWeight: '700' },
  confirmDelete: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#b94f3d', borderWidth: 1, borderColor: 'rgba(255,227,218,0.2)' },
  confirmDeleteText: { color: '#fff7f1', fontSize: 13, fontWeight: '700' },
});
