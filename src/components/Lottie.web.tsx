import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Player, PlayerEvent } from '@lottiefiles/react-lottie-player';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { AnimationItem } from 'lottie-web';
export const LOTTIE = {
  shock: require('../../assets/lottie/Shock.json'),
  welcome: require('../../assets/lottie/welcome.json'),
  locationAsk: require('../../assets/lottie/location-ask.json'),
  locationDenied: require('../../assets/lottie/location-denied.json'),
  locationGranted: require('../../assets/lottie/location-granted.json'),
};
export const LottieSlot = ({
  source,
  size = 160,
  loop = true,
}: {
  source: any;
  size?: number;
  loop?: boolean;
}) => {
  return (
    <View style={{ width: size, height: size }}>
      <Player
        autoplay
        loop={loop}
        src={source}
        style={{
          width: size,
          height: size,
        }}
      />
    </View>
  );
};
const clamp01 = (v: number) => {
  'worklet';
  return Math.min(Math.max(v, 0), 1);
};
export const WelcomeLottie = ({
  welcome,
  step,
  complete,
  onIntroComplete,
}: {
  welcome: SharedValue<number>;
  step: SharedValue<number>;
  complete: boolean;
  onIntroComplete: () => void;
}) => {
  const animation = useRef<AnimationItem | null>(null);
  const stage = useRef<'waiting' | 'first' | 'middle' | 'final' | 'done'>('waiting');
  const completeRef = useRef(complete);
  const introCallback = useRef(onIntroComplete);
  completeRef.current = complete;
  introCallback.current = onIntroComplete;
  const playFinal = useCallback(() => {
    if (!animation.current) return;
    stage.current = 'final';
    animation.current.setSpeed(3);
    animation.current.playSegments([246, 493], true);
  }, []);
  const playIntro = useCallback(() => {
    if (!animation.current || stage.current !== 'waiting') return;
    stage.current = 'first';
    animation.current.setSpeed(2);
    animation.current.playSegments([0, 246], true);
  }, []);
  useEffect(() => {
    if (complete && stage.current === 'middle') playFinal();
  }, [complete, playFinal]);
  const onEvent = useCallback((event: PlayerEvent) => {
    if (event === PlayerEvent.Ready) playIntro();
    if (event === PlayerEvent.Complete && stage.current === 'first') {
      stage.current = 'middle';
      introCallback.current();
      if (completeRef.current) playFinal();
    } else if (event === PlayerEvent.Complete && stage.current === 'final') {
      stage.current = 'done';
    }
  }, [playFinal, playIntro]);
  const style = useAnimatedStyle(() => {
    const intro = 1 - clamp01(step.value + 1);
    const outro = clamp01(step.value - 4);
    const o = welcome.value * Math.max(intro, outro);
    return {
      opacity: o,
      transform: [{ scale: 0.6 + 0.4 * o }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.center,
        style,
        { pointerEvents: 'none' },
      ]}
    >
      <Player
        src={LOTTIE.welcome}
        autoplay={false}
        loop={false}
        lottieRef={item => {
          animation.current = item;
          if (item) playIntro();
        }}
        onEvent={onEvent}
        style={{ width: 240, height: 240 }}
      />
    </Animated.View>
  );
};
const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
});
