import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { confirmSignUp, resendConfirmationCode, signIn, signUp } from '../../auth/cognito';
import { Button } from '../../components/Button';
import { colors } from '../../theme';
import { t } from '../../ui/type';
import { VerificationCodeInput } from './VerificationCodeInput';
type Mode = 'signup' | 'signin' | 'confirm';
const TITLES: Record<Mode, string> = {
  signup: 'Create your account',
  signin: 'Welcome back',
  confirm: 'Check your email',
};
export const AuthCard = ({ onSuccess }: { onSuccess: (idToken: string) => void | Promise<void> }) => {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const passwordMismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const fail = (e: unknown) => {
    setError((e as Error)?.message ?? 'Something went wrong. Try again.');
    shake.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withRepeat(withTiming(10, { duration: 100 }), 4, true),
      withTiming(0, { duration: 60 }),
    );
  };
  const submit = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Your passwords do not match.');
          return;
        }
        const confirmed = await signUp(normalizedEmail, password);
        if (confirmed) await onSuccess(await signIn(normalizedEmail, password));
        else {
          setMode('confirm');
          setNotice(`We sent a verification code to ${normalizedEmail}.`);
        }
      } else if (mode === 'confirm') {
        await confirmSignUp(normalizedEmail, code.trim());
        if (password.length >= 8) await onSuccess(await signIn(normalizedEmail, password));
        else {
          setMode('signin');
          setCode('');
          setNotice('Your email is verified. Sign in with your password.');
        }
      } else {
        await onSuccess(await signIn(normalizedEmail, password));
      }
    } catch (e) {
      const authError = e as Error & { code?: string };
      const errorName = authError.name || authError.code;
      if (mode === 'signin' && errorName === 'UserNotConfirmedException') {
        setMode('confirm');
        setNotice(`This account needs email verification. Enter the code sent to ${normalizedEmail}.`);
        try {
          await resendConfirmationCode(normalizedEmail);
          setNotice(`A new verification code was sent to ${normalizedEmail}.`);
        } catch (resendError) {
          setError((resendError as Error)?.message ?? 'We could not resend the code. Try again below.');
        }
      } else if (mode === 'signup' && errorName === 'UsernameExistsException') {
        setMode('signin');
        setNotice('An account already uses this email. Sign in to continue.');
      } else {
        fail(e);
      }
    } finally {
      setBusy(false);
    }
  };
  const resendCode = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await resendConfirmationCode(email.trim().toLowerCase());
      setNotice(`A new verification code was sent to ${email.trim().toLowerCase()}.`);
    } catch (e) {
      setError((e as Error)?.message ?? 'We could not resend the code. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const ready = mode === 'confirm' ? code.length === 6 : email.includes('@') && password.length >= 8 && (mode !== 'signup' || password === confirmPassword);
  return (
    <Animated.View style={[{ flex: 1, justifyContent: 'space-between' }, shakeStyle]}>
      <View>
        <Text style={t.title}>{TITLES[mode]}</Text>
        {mode === 'confirm' && <View style={styles.verifyIntro}>
          <Text style={styles.verifyDescription}>Enter the 6-digit code we sent to</Text>
          <Text selectable={false} style={styles.verifyEmail}>{email}</Text>
        </View>}
        {mode !== 'confirm' ? (
          <Animated.View key="creds" entering={FadeIn} exiting={FadeOut}>
            <TextInput
              style={t.input}
              placeholder="Email"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={t.input}
              placeholder="Password (8+ characters)"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {mode === 'signup' && <TextInput
              style={t.input}
              placeholder="Confirm password"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              returnKeyType="done"
            />}
            {passwordMismatch && <Text style={t.error}>Passwords do not match.</Text>}
          </Animated.View>
        ) : (
          <Animated.View key="code" entering={FadeIn} exiting={FadeOut}>
            <VerificationCodeInput value={code} onChange={setCode} disabled={busy} />
          </Animated.View>
        )}
        {!!error && <Text style={t.error}>{error}</Text>}
        {!!notice && <View accessibilityLiveRegion="polite" style={styles.authNotice}><View style={styles.noticeDot} /><Text style={styles.authNoticeText}>{notice.replace(`A new verification code was sent to ${email.trim().toLowerCase()}.`, 'A new code was sent to your email.')}</Text></View>}
      </View>
      <View>
        <Button
          label={busy ? 'Please wait' : mode === 'signup' ? 'Create account' : mode === 'confirm' ? 'Verify' : 'Sign in'}
          disabled={busy || !ready}
          onPress={submit}
        />
        {mode === 'confirm' && (
          <Pressable disabled={busy} onPress={resendCode}>
            <Text style={t.link}>{busy ? 'Please wait' : 'Resend verification code'}</Text>
          </Pressable>
        )}
        {mode !== 'confirm' && (
          <Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
            <Text style={t.link}>{mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  verifyIntro: { marginTop: 8, marginBottom: 22 },
  verifyDescription: { color: colors.textDim, fontSize: 15, lineHeight: 21 },
  verifyEmail: { alignSelf: 'flex-start', maxWidth: '100%', overflow: 'hidden', color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(239,237,222,0.07)', borderWidth: 1, borderColor: 'rgba(239,237,222,0.1)' },
  authNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: 'rgba(197,209,138,0.08)', borderWidth: 1, borderColor: 'rgba(197,209,138,0.15)' },
  noticeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  authNoticeText: { flex: 1, color: colors.accent, fontSize: 12, lineHeight: 17 },
});
