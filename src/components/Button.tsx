import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, radius } from '../theme';
type Props = { label: string; onPress: () => void; disabled?: boolean; ghost?: boolean; compact?: boolean };
export const Button = ({ label, onPress, disabled, ghost, compact }: Props) => {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(0.96))}
      onPressOut={() => (scale.value = withSpring(1))}>
      <Animated.View style={[styles.btn, compact && styles.compact, ghost && styles.ghost, disabled && styles.disabled, anim]}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.label, compact && styles.compactLabel, ghost && styles.ghostLabel, disabled && styles.disabledLabel]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
};
const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.button,
    borderWidth: 2,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { height: 44, borderWidth: 1, paddingHorizontal: 8 },
  compactLabel: { fontSize: 14 },
  ghost: { backgroundColor: 'transparent' },
  disabled: { backgroundColor: 'rgba(239, 237, 222, 0.06)', borderColor: 'rgba(239, 237, 222, 0.11)' },
  label: { color: colors.buttonText, fontSize: 16, fontWeight: '600' },
  ghostLabel: { color: colors.accent },
  disabledLabel: { color: colors.textDim },
});
