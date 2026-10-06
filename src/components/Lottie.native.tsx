import LottieView from 'lottie-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
type Source = React.ComponentProps<typeof LottieView>['source'];
export const LOTTIE = {
  shock: require('../../assets/lottie/Shock.json'),
  welcome: require('../../assets/lottie/welcome.json'),
  locationAsk: require('../../assets/lottie/location-ask.json'),
  locationDenied: require('../../assets/lottie/location-denied.json'),
  locationGranted: require('../../assets/lottie/location-granted.json'),
};
export const LottieSlot = ({ source, size = 160, loop = true }: { source: Source; size?: number; loop?: boolean }) => (
  <LottieView source={source} autoPlay loop={loop} style={{ width: size, height: size }} />
);
const clamp01 = (v: number) => {
  'worklet';
  return Math.min(Math.max(v, 0), 1);
};
export const WelcomeLottie = ({ welcome, step, complete, onIntroComplete }: { welcome: SharedValue<number>; step: SharedValue<number>; complete: boolean; onIntroComplete: () => void }) => {
  const animation = useRef<LottieView>(null);
  const [loaded, setLoaded] = useState(false);
  const stage = useRef<'waiting' | 'first' | 'middle' | 'final' | 'done'>('waiting');
  const startFinal = useCallback(() => {
    stage.current = 'final';
    animation.current?.play(246, 493);
  }, []);
  useEffect(() => {
    if (loaded && stage.current === 'waiting') {
      stage.current = 'first';
      animation.current?.play(0, 246);
    }
    if (loaded && complete && stage.current === 'middle') startFinal();
  }, [complete, loaded, startFinal]);
  const onAnimationFinish = () => {
    if (stage.current === 'first') {
      stage.current = 'middle';
      onIntroComplete();
      if (complete) startFinal();
    } else if (stage.current === 'final') {
      stage.current = 'done';
    }
  };
  const style = useAnimatedStyle(() => {
    const intro = 1 - clamp01(step.value + 1);
    const outro = clamp01(step.value - 4);
    const o = welcome.value * Math.max(intro, outro);
    return { opacity: o, transform: [{ scale: 0.6 + 0.4 * o }] };
  });
  return (
    <Animated.View style={[styles.center, { pointerEvents: 'none' }, style]}>
      <LottieView
        ref={animation}
        source={LOTTIE.welcome}
        autoPlay={false}
        loop={false}
        speed={2}
        onAnimationLoaded={() => setLoaded(true)}
        onAnimationFinish={onAnimationFinish}
        style={{ width: 240, height: 240 }}
      />
    </Animated.View>
  );
};
const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 20, elevation: 20 },
});
