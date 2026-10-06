import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Easing,
  SharedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { getIdToken } from '../auth/cognito';
import { GlassCard } from '../components/GlassCard';
import { WelcomeLottie } from '../components/Lottie';
import { downloadProfile, loadProfile, Profile, saveProfile, uploadProfile } from '../data/profile';
import { QUESTIONS, QuestionKey } from '../data/questions';
import { writeJson } from '../data/localStore';
import { CARD_COUNT, CARD_SPRING } from '../theme';
import { AuthCard } from './cards/AuthCard';
import { LocationCard } from './cards/LocationCard';
import { QuestionCard } from './cards/QuestionCard';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const Onboarding = ({ loader, onDone }: { loader: SharedValue<number>; onDone: () => void }) => {
  const step = useSharedValue(-1);
  const orbit = useSharedValue(0);
  const finale = useSharedValue(0);
  const welcome = useSharedValue(1);
  const [current, setCurrent] = useState(-1);
  const introStarted = useRef(false);
  const introFinished = useRef(false);
  const sessionReady = useRef(false);
  const resumeStep = useRef(0);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profile = useRef<Profile>({});
  const token = useRef<string | null>(null);
  const go = useCallback(
    (n: number) => {
      setCurrent(n);
      step.value = withSpring(n, CARD_SPRING);
    },
    [step],
  );
  const startOnboarding = useCallback(() => {
    if (introStarted.current) return;
    introFinished.current = true;
    if (!sessionReady.current) return;
    introStarted.current = true;
    if (introTimer.current) clearTimeout(introTimer.current);
    go(resumeStep.current);
  }, [go]);
  useEffect(() => {
    orbit.value = withRepeat(withTiming(2 * Math.PI, { duration: 26000, easing: Easing.linear }), -1, false);
    introTimer.current = setTimeout(startOnboarding, 2200);
    let active = true;
    void (async () => {
      const [localProfile, currentToken] = await Promise.all([
        loadProfile(),
        getIdToken().catch(() => null),
      ]);
      let remoteProfile: Profile | null = null;
      if (currentToken) remoteProfile = await downloadProfile(currentToken).catch(() => null);
      if (!active) return;
      const merged = { ...(localProfile ?? {}), ...(remoteProfile ?? {}) };
      profile.current = merged;
      token.current = currentToken;
      if (currentToken && remoteProfile) await saveProfile(merged);
      if (currentToken && merged.completedAt) {
        onDone();
        return;
      }
      const firstUnanswered = QUESTIONS.findIndex(question => !merged[question.key]);
      resumeStep.current = currentToken ? (firstUnanswered < 0 ? 4 : firstUnanswered + 1) : 0;
      sessionReady.current = true;
      if (introFinished.current) startOnboarding();
    })().catch(() => {
      if (!active) return;
      sessionReady.current = true;
      resumeStep.current = 0;
      if (introFinished.current) startOnboarding();
    });
    return () => {
      active = false;
      if (introTimer.current) clearTimeout(introTimer.current);
    };
  }, [onDone, orbit, startOnboarding]);
  const answer = async (key: QuestionKey, value: string, next: number) => {
    profile.current = { ...profile.current, [key]: value };
    await saveProfile(profile.current);
    const currentToken = token.current ?? await getIdToken().catch(() => null);
    if (currentToken) {
      token.current = currentToken;
      try {
        await uploadProfile(currentToken, profile.current);
        profile.current = { ...profile.current, synced: true };
      } catch {
        profile.current = { ...profile.current, synced: false };
      }
      await saveProfile(profile.current);
    }
    go(next);
  };
  const finish = async (location: Profile['location'], locationAccuracy?: number) => {
    profile.current = { ...profile.current, location, locationAccuracy: location ? locationAccuracy ?? null : null, completedAt: new Date().toISOString(), synced: false };
    await saveProfile(profile.current);
    await writeJson('cache', { location, savedAt: profile.current.completedAt });
    setCurrent(CARD_COUNT);
    step.value = withSpring(CARD_COUNT, CARD_SPRING);
    loader.value = withTiming(1, { duration: 400 });
    finale.value = withDelay(500, withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }));
    welcome.value = withDelay(500, withTiming(0, { duration: 1400 }));
    const [upload] = await Promise.allSettled([
      uploadProfile((await getIdToken()) ?? token.current, profile.current),
      sleep(2200),
    ]);
    await saveProfile({ ...profile.current, synced: upload.status === 'fulfilled' });
    loader.value = withTiming(0, { duration: 300 });
    await sleep(350);
    onDone();
  };
  const shared = { step, orbit, finale };
  return (
    <View style={StyleSheet.absoluteFill}>
      <WelcomeLottie welcome={welcome} step={step} complete={current === CARD_COUNT} onIntroComplete={startOnboarding} />
      <GlassCard index={0} active={current === 0} {...shared}>
        <AuthCard
          onSuccess={async t => {
            token.current = t;
            const [localProfile, remoteProfile] = await Promise.all([
              loadProfile(),
              downloadProfile(t).catch(() => null),
            ]);
            const merged = { ...(localProfile ?? {}), ...(remoteProfile ?? {}) };
            profile.current = merged;
            await saveProfile(merged);
            if (merged.completedAt) {
              onDone();
              return;
            }
            const firstUnanswered = QUESTIONS.findIndex(question => !merged[question.key]);
            resumeStep.current = firstUnanswered < 0 ? 4 : firstUnanswered + 1;
            sessionReady.current = true;
            go(resumeStep.current);
          }}
        />
      </GlassCard>
      {QUESTIONS.map((q, i) => (
        <GlassCard key={q.key} index={i + 1} active={current === i + 1} {...shared}>
          <QuestionCard question={q} onSubmit={v => answer(q.key, v, i + 2)} />
        </GlassCard>
      ))}
      <GlassCard index={4} active={current === 4} {...shared}>
        <LocationCard onDone={finish} />
      </GlassCard>
    </View>
  );
};
