import { ReactNode, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { Check, ChevronLeft } from 'lucide-react-native';
import { colors, font, radius, space, tap } from '@/theme';
import { colorFor, PALETTE } from '@/lib/palette';

// `tab`: the screen sits above the bottom tab bar, which already clears the phone's bottom edge.
export function Screen({ children, back, footer, tab }: { children: ReactNode; back?: boolean; footer?: ReactNode; tab?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={tab ? ['top', 'left', 'right'] : undefined}>
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
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }}>
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

// Initials avatars only. No photos of minors, ever (brief §5g). Pass the person's id (and their
// chosen colorKey, if any) to give them their own color; without an id it falls back to plain styles.
export function Avatar({ name, size = 48, tone = 'accent', id, colorKey, ring }: { name: string; size?: number; tone?: 'accent' | 'sun'; id?: string; colorKey?: string | null; ring?: boolean }) {
  const c = id ? colorFor(id, colorKey) : null;
  // A person's avatar is a solid color with white initials: much easier to tell apart at a glance
  // than a pastel. Without an id (no person to color) the old soft look is kept.
  const bg = c ? c.fg : tone === 'accent' ? colors.accentSoft : colors.sunk;
  const fg = c ? '#FFFFFF' : tone === 'accent' ? colors.accent : colors.ink;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: colors.surface,
      }}
    >
      <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.38 }}>{initialsOf(name)}</Text>
    </View>
  );
}

// A row of swatches for choosing a person's color.
export function ColorPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {PALETTE.map((c) => {
        const on = c.key === value;
        return (
          <Pressable
            key={c.key}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(c.key)}
            style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: on ? colors.ink : 'transparent' }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.fg, alignItems: 'center', justifyContent: 'center' }}>
              {on && <Check size={22} color="#FFFFFF" strokeWidth={3} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// A soft pulsing placeholder shown while a screen's data is still arriving, so the page has its shape
// right away instead of a blank gap or a spinner.
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View accessibilityLabel="Loading" style={[s.card, { opacity: pulse, flexDirection: 'row', alignItems: 'center', gap: space.md }]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sunk }} />
      <View style={{ flex: 1, gap: space.sm }}>
        <View style={{ height: 16, width: '60%', borderRadius: 8, backgroundColor: colors.sunk }} />
        {lines > 1 && <View style={{ height: 12, width: '85%', borderRadius: 6, backgroundColor: colors.sunk }} />}
      </View>
    </Animated.View>
  );
}

// What a screen says when there is nothing to show yet: a small icon, one plain sentence of what this
// is, and (when there is a next step) one button for it.
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: { label: string; onPress: () => void; icon?: ReactNode; variant?: 'primary' | 'secondary' } }) {
  return (
    <FadeIn>
      <View style={[s.card, { alignItems: 'flex-start', gap: space.sm, padding: space.lg }]}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <Heading>{title}</Heading>
        <Body soft>{body}</Body>
        {action && (
          <View style={{ alignSelf: 'stretch', marginTop: space.xs }}>
            <Button label={action.label} icon={action.icon} variant={action.variant} onPress={action.onPress} />
          </View>
        )}
      </View>
    </FadeIn>
  );
}

// Eases content in as it arrives (a short fade and rise), so lists settle instead of popping.
export function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 240, delay, useNativeDriver: false }).start();
  }, [t, delay]);
  return <Animated.View style={{ opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
}

// A short confirmation that appears, holds, and fades by itself ("Leia picked up").
export function Flash({ text, id }: { text: string; id: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.delay(1700),
      Animated.timing(t, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
  }, [id, t]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }], flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: space.md }}
    >
      <Check size={18} color="#fff" strokeWidth={3} />
      <Text style={[font.label, { color: '#fff' }]}>{text}</Text>
    </Animated.View>
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
        minHeight: small ? 44 : 48,
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
