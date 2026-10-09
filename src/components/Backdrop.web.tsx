import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { isDarkTheme } from '../theme';

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
    backgroundColor: isDarkTheme ? '#101512' : '#fbf5f7',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage: isDarkTheme
      ? 'radial-gradient(ellipse at 50% 42%, rgba(103, 119, 73, 0.24) 0%, rgba(38, 48, 37, 0.18) 38%, rgba(16, 21, 18, 0) 74%)'
      : 'radial-gradient(ellipse at 50% 42%, rgba(219, 168, 183, 0.22) 0%, rgba(247, 225, 232, 0.24) 38%, rgba(251, 245, 247, 0) 74%)',
  } as never,
  ring: {
    position: 'absolute',
    bottom: 68,
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderWidth: 5,
    borderColor: isDarkTheme ? 'rgba(239, 237, 222, 0.15)' : 'rgba(139, 83, 101, 0.14)',
    borderTopColor: isDarkTheme ? '#c5d18a' : '#c9869b',
    borderRightColor: isDarkTheme ? '#d4bd82' : '#d9a8b7',
    borderRadius: 24,
    shadowColor: isDarkTheme ? '#c5d18a' : '#c9869b',
    shadowOpacity: 0.24,
    shadowRadius: 8,
  },
});

export default Backdrop;
