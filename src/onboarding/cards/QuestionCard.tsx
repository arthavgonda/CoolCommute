import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import type { Question } from '../../data/questions';
import { colors, isDarkTheme, radius } from '../../theme';
import { t } from '../../ui/type';
export const QuestionCard = ({ question, onSubmit }: { question: Question; onSubmit: (value: string) => void }) => {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View>
        <Text style={[t.title, !isDarkTheme && styles.lightTitle]}>{question.title}</Text>
        {!!question.hint && <Text style={[t.body, !isDarkTheme && styles.lightHint]}>{question.hint}</Text>}
        <View style={{ marginTop: 20, gap: 12 }}>
          {question.options.map(o => (
            <Pressable
              key={o.value}
              onPress={() => setPicked(o.value)}
              style={[styles.option, picked === o.value && styles.on]}>
              <Text style={styles.label}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Button label="Continue" disabled={!picked} onPress={() => picked && onSubmit(picked)} />
    </View>
  );
};
const styles = StyleSheet.create({
  lightTitle: { fontSize: 26, lineHeight: 32, textAlign: 'center', marginTop: 14 },
  lightHint: { textAlign: 'center', color: '#98788c' },
  option: {
    minHeight: 56,
    borderRadius: radius.input,
    borderWidth: 2,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  on: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  label: { color: colors.text, fontSize: 16 },
});
