import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, font, radius, space, tap } from '@/theme';

export function Screen({ children, back, footer }: { children: ReactNode; back?: boolean; footer?: ReactNode }) {
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.column}>
          {back && <BackButton />}
          {children}
        </View>
      </ScrollView>
      {footer && (
        <View style={s.footerWrap}>
          <View style={s.column}>{footer}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

export function BackButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={s.back}
      hitSlop={8}
    >
      <ChevronLeft size={24} color={colors.ink} strokeWidth={2.25} />
    </Pressable>
  );
}

export function Display({ children }: { children: ReactNode }) {
  return <Text style={[s.text, font.display]}>{children}</Text>;
}
export function Title({ children }: { children: ReactNode }) {
  return <Text style={[s.text, font.title]}>{children}</Text>;
}
export function Heading({ children }: { children: ReactNode }) {
  return <Text style={[s.text, font.heading]}>{children}</Text>;
}
export function Body({ children, soft, style }: { children: ReactNode; soft?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.text, font.body, soft && { color: colors.inkSoft }, style]}>{children}</Text>;
}
export function Small({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.text, font.small, { color: colors.inkSoft }, style]}>{children}</Text>;
}

export function Gap({ size = 'md' }: { size?: keyof typeof space }) {
  return <View style={{ height: space[size] }} />;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
};
export function Button({ label, onPress, variant = 'primary', loading, disabled, icon }: ButtonProps) {
  const off = disabled || loading;
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.button,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'secondary' && { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
        variant === 'danger' && { backgroundColor: 'transparent' },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        off && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text style={[font.heading, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[s.text, font.label]}>{label}</Text>
      <TextInput
        placeholderTextColor="#A39787"
        {...props}
        style={[s.input, props.multiline && { minHeight: 112, paddingTop: space.md, textAlignVertical: 'top' }]}
      />
      {hint ? <Small>{hint}</Small> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = <View style={[s.card, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Initials avatars only. No photos of minors, ever (brief §5g).
export function Avatar({ name, size = 48, tone = 'accent' }: { name: string; size?: number; tone?: 'accent' | 'sun' }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone === 'accent' ? colors.accentSoft : colors.sunk,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: tone === 'accent' ? colors.accent : colors.ink, fontWeight: '800', fontSize: size * 0.36 }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.bg }}>{children}</View>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.error}>
      <Text style={[font.label, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: space.md, paddingBottom: space.xl },
  column: { width: '100%', maxWidth: 560, gap: space.md, paddingTop: space.md },
  footerWrap: {
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    paddingTop: space.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  text: { color: colors.ink },
  back: { width: tap, height: 40, justifyContent: 'center', marginLeft: -space.sm },
  button: {
    minHeight: tap,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  input: {
    minHeight: tap,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 17,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  error: { backgroundColor: '#FBE4E2', borderRadius: radius.sm, padding: space.md },
});

export function Chip({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        minHeight: small ? 40 : 48,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        justifyContent: 'center',
        backgroundColor: on ? colors.ink : colors.surface,
        borderWidth: 1.5,
        borderColor: on ? colors.ink : colors.line,
      }}
    >
      <Text style={[font.label, { color: on ? '#fff' : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Wrap({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
}

// Go back if there is somewhere to go back to; otherwise land on `fallback`. A deep link or a
// refreshed page has no history, and a plain router.back() would leave the screen stuck.
export function leave(fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
