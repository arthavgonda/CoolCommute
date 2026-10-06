import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

const Backdrop = ({ loader }: { loader: SharedValue<number> }) => {
  const ringStyle = useAnimatedStyle(() => ({
    opacity: loader.value,
    transform: [{ rotate: `${loader.value * 360}deg` }, { scale: 0.75 + loader.value * 0.25 }],
  }));

  return (
    <View style={styles.root}>
      <View style={styles.glow as never} />
      <Animated.View style={[styles.ring, ringStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#101512',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage: 'radial-gradient(ellipse at 50% 42%, rgba(103, 119, 73, 0.24) 0%, rgba(38, 48, 37, 0.18) 38%, rgba(16, 21, 18, 0) 74%)',
  } as never,
  ring: {
    position: 'absolute',
    bottom: 68,
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderWidth: 5,
    borderColor: 'rgba(239, 237, 222, 0.15)',
    borderTopColor: '#c5d18a',
    borderRightColor: '#d4bd82',
    borderRadius: 24,
    shadowColor: '#c5d18a',
    shadowOpacity: 0.24,
    shadowRadius: 8,
  },
});

export default Backdrop;
