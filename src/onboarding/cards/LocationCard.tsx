import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Button } from '../../components/Button';
import { LOTTIE, LottieSlot } from '../../components/Lottie';
import type { Place } from '../../data/profile';
import { t } from '../../ui/type';
type State = 'idle' | 'granted' | 'denied';
export const LocationCard = ({ onDone }: { onDone: (place: Place | null, accuracy?: number) => void }) => {
  const [state, setState] = useState<State>('idle');
  const [place, setPlace] = useState<Place | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const ask = async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState('denied');
        return;
      }
      setState('granted');
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }).then(position => {
        if (!mounted.current) return;
        setPlace({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationAccuracy(position.coords.accuracy ?? undefined);
      }).catch(() => {});
    } catch {
      setState('denied');
    } finally {
      setBusy(false);
    }
  };
  const copy = {
    idle: ['Where do you commute from?', 'Allow location access to personalize your commute experience.'],
    denied: ['Location access is off', 'You can continue without sharing your location.'],
    granted: ['Location access is on', "You're all set."],
  }[state];
  const lottie = { idle: LOTTIE.locationAsk, denied: LOTTIE.locationDenied, granted: LOTTIE.locationGranted }[state];
  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center' }}>
        <LottieSlot key={state} source={lottie} size={150} loop={state === 'idle'} />
        <Text style={[t.title, { textAlign: 'center' }]}>{copy[0]}</Text>
        <Text style={[t.body, { textAlign: 'center' }]}>{copy[1]}</Text>
      </View>
      <View style={{ gap: 12 }}>
        {state === 'idle' && <Button label={busy ? 'Please wait' : 'Allow location'} disabled={busy} onPress={ask} />}
        {state === 'denied' && (
          <>
            <Button label="Try again" disabled={busy} ghost onPress={ask} />
            <Button label="Continue without location" disabled={busy} onPress={() => onDone(null)} />
          </>
        )}
        {state === 'granted' && <Button label="Finish" onPress={() => onDone(place, locationAccuracy)} />}
      </View>
    </View>
  );
};
