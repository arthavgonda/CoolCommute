import 'react-native-get-random-values';
import './src/location/backgroundLocationTask';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeOut, useSharedValue } from 'react-native-reanimated';
import { getIdToken } from './src/auth/cognito';
import Backdrop from './src/components/Backdrop';
import { loadProfile } from './src/data/profile';
import { Home } from './src/home/Home';
import { Onboarding } from './src/onboarding/Onboarding';
import { colors } from './src/theme';
type Route = 'boot' | 'onboarding' | 'home';
export default function App() {
  const [route, setRoute] = useState<Route>('boot');
  const loader = useSharedValue(0);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.dataset.appTextSelection = 'disabled';
    style.textContent = `html, body, #root, #root * { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none; } input, textarea, [contenteditable="true"] { -webkit-user-select: text !important; user-select: text !important; -webkit-touch-callout: default; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  useEffect(() => {
    (async () => {
      const [token, profile] = await Promise.all([getIdToken().catch(() => null), loadProfile()]);
      setRoute(token && profile?.completedAt ? 'home' : 'onboarding');
    })();
  }, []);
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Backdrop loader={loader} />
      {route === 'onboarding' && (
        <Animated.View key="onboarding" style={StyleSheet.absoluteFill} exiting={FadeOut.duration(400)}>
          <Onboarding loader={loader} onDone={() => setRoute('home')} />
        </Animated.View>
      )}
      {route === 'home' && (
        <Animated.View key="home" style={StyleSheet.absoluteFill} entering={FadeIn.duration(600)}>
          <Home onSignedOut={() => setRoute('onboarding')} />
        </Animated.View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
