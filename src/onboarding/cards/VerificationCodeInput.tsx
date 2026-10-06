import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FlipInXDown, FlipOutXDown, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius } from '../../theme';

const CODE_LENGTH = 6;

export const VerificationCodeInput = ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) => {
  const inputRef = useRef<TextInput>(null);
  const progress = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 500 }, { rotateY: `${interpolate(progress.value, [0, 1], [-22.5, 22.5])}deg` }, { rotateX: '-22.5deg' }] }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(progress.value, [0, 1], [-4, 4]) }] }));

  useEffect(() => {
    progress.value = withTiming(Math.min(value.length / CODE_LENGTH, 1), { duration: 500 });
  }, [progress, value.length]);

  const normalized = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
  const focus = () => inputRef.current?.focus();

  return (
    <View style={styles.root}>
      <Animated.View accessibilityElementsHidden style={[styles.face, faceStyle]}>
        <Animated.View style={[styles.brows, eyeStyle]}><View style={styles.brow} /><View style={styles.brow} /></Animated.View>
        <Animated.View style={[styles.eyes, eyeStyle]}><View style={styles.eye} /><View style={styles.eye} /></Animated.View>
        <View style={styles.mouthWrap}><View style={[styles.mouth, normalized.length === CODE_LENGTH && styles.mouthComplete]} /></View>
      </Animated.View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Verification code, ${normalized.length} of ${CODE_LENGTH} digits entered`} accessibilityHint="Double tap to enter or edit the code" disabled={disabled} onPress={focus} style={styles.codeRow}>
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const digit = normalized[index];
          const active = index === normalized.length;
          return (
            <View key={index} style={[styles.digitCell, active && styles.digitCellActive, !!digit && styles.digitCellFilled]}>
              {!!digit && <Animated.Text entering={FlipInXDown.duration(420).easing(Easing.bezier(0, 0.75, 0.5, 0.9).factory()).build()} exiting={FlipOutXDown.duration(350).easing(Easing.bezier(0.6, 0.1, 0.4, 0.8).factory()).build()} style={styles.digit}>{digit}</Animated.Text>}
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={inputRef}
        accessibilityLabel="Six digit verification code"
        value={normalized}
        onChangeText={text => onChange(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        caretHidden
        style={styles.hiddenInput}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { width: '100%', alignItems: 'center' },
  face: { width: 54, height: 54, borderRadius: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17251c', borderWidth: 1, borderColor: 'rgba(222,231,210,0.15)' },
  brows: { flexDirection: 'row', gap: 11, marginBottom: 2 },
  brow: { width: 8, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  eyes: { flexDirection: 'row', gap: 13 },
  eye: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text },
  mouthWrap: { height: 9, marginTop: 3, justifyContent: 'flex-start' },
  mouth: { width: 12, height: 4, borderBottomWidth: 1.5, borderColor: colors.text, borderRadius: 6 },
  mouthComplete: { height: 7, borderBottomWidth: 1.5, borderTopWidth: 0 },
  codeRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 7 },
  digitCell: { flex: 1, maxWidth: 50, minHeight: 54, aspectRatio: 0.94, alignItems: 'center', justifyContent: 'center', borderRadius: radius.input, borderWidth: 1.5, borderColor: colors.glassBorder, backgroundColor: 'rgba(15,24,18,0.55)' },
  digitCellActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  digitCellFilled: { borderColor: 'rgba(197,209,138,0.48)' },
  digit: { color: colors.text, fontSize: 22, fontWeight: '600' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0, top: 0, left: 0, color: 'transparent' },
});
