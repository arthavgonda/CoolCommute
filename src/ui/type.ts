import { StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
export const t = StyleSheet.create({
  title: { color: colors.text, fontSize: 24, fontWeight: '700', lineHeight: 30 },
  body: { color: colors.textDim, fontSize: 15, lineHeight: 21, marginTop: 8 },
  error: { color: colors.danger, fontSize: 14, marginTop: 12 },
  link: { color: colors.accent, fontSize: 14, textAlign: 'center', marginTop: 16 },
  input: {
    height: 52,
    borderRadius: radius.input,
    borderWidth: 2,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    color: colors.text,
    paddingHorizontal: 16,
    fontSize: 16,
    marginTop: 12,
  },
});
