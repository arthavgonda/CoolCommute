import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LOTTIE, LottieSlot } from './Lottie';
import type { BackendFailure } from '../data/backendFailure';

export const BackendErrorScreen = ({ failure }: { failure: BackendFailure }) => {
  const [retrying, setRetrying] = useState(false);
  const notFound = failure.kind === 'not-found';
  const title = notFound ? 'Service route not found' : failure.kind === 'server' ? 'Service temporarily unavailable' : 'Unable to connect';
  const description = notFound
    ? 'The app reached the server, but the requested API route was not found.'
    : failure.kind === 'server'
      ? 'The service encountered a problem. Please try again in a moment.'
      : failure.kind === 'invalid-response'
        ? 'The service returned a response the app could not read.'
        : 'Check your internet connection and try again.';

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await failure.retry();
    } catch {
      return;
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <LottieSlot source={LOTTIE.backend404} size={280} loop />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {failure.status !== undefined && <Text style={styles.status}>Error {failure.status}</Text>}
        <Pressable accessibilityRole="button" disabled={retrying} onPress={() => void retry()} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed, retrying && styles.disabled]}>
          {retrying ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.retryText}>Try again</Text>}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#ffffff' },
  content: { width: '100%', maxWidth: 440, alignItems: 'center' },
  title: { marginTop: 12, color: '#152019', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  description: { maxWidth: 340, marginTop: 9, color: '#58645b', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  status: { marginTop: 10, color: '#788279', fontSize: 12, fontWeight: '600' },
  retryButton: { minWidth: 148, height: 48, marginTop: 26, paddingHorizontal: 22, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17231a' },
  retryText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.65 },
});
