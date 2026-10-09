import { ReactNode, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { ArrowLeftRight, Check, ChevronRight, Clock, Flag, MapPin, Play, UserCheck, X } from 'lucide-react-native';
import { Broadcast, broadcastText, Swap, timeAgo } from '@/lib/social';
import { fmtTime, prettyDate } from '@/lib/schedule';
import { Body, Button, Small } from '@/components/ui';
import { colors, font, radius, space } from '@/theme';

const ICONS: Record<Broadcast['type'], { icon: (c: string) => ReactNode; bg: string; fg: string }> = {
  running_late: { icon: (c) => <Clock size={20} color={c} strokeWidth={2.25} />, bg: colors.warnBg, fg: colors.warnFg },
  ride_started: { icon: (c) => <Play size={20} color={c} strokeWidth={2.25} />, bg: colors.accentSoft, fg: colors.accent },
  arriving: { icon: (c) => <MapPin size={20} color={c} strokeWidth={2.25} />, bg: colors.accentSoft, fg: colors.accent },
  picked_up: { icon: (c) => <Check size={20} color={c} strokeWidth={2.5} />, bg: colors.okSoft, fg: colors.ok },
  dropped_off: { icon: (c) => <Check size={20} color={c} strokeWidth={2.5} />, bg: colors.okSoft, fg: colors.ok },
  ride_completed: { icon: (c) => <Flag size={20} color={c} strokeWidth={2.25} />, bg: colors.okSoft, fg: colors.ok },
  swap_requested: { icon: (c) => <ArrowLeftRight size={20} color={c} strokeWidth={2.25} />, bg: colors.warnBg, fg: colors.warnFg },
  swap_accepted: { icon: (c) => <UserCheck size={20} color={c} strokeWidth={2.25} />, bg: colors.okSoft, fg: colors.ok },
};

// A persistent in-app status line. Nothing important lives only in a push notification (brief §8).
// With onDismiss it can be swiped away (either direction) or cleared with the X.
export function UpdateRow({ b, showRide, onPress, onDismiss }: { b: Broadcast; showRide?: boolean; onPress?: () => void; onDismiss?: () => void }) {
  const s = ICONS[b.type];
  const x = useRef(new Animated.Value(0)).current;
  const dragged = useRef(false); // a swipe must never also count as a tap on the card
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only take over for a clearly sideways drag, so taps and vertical scrolling still work.
        onMoveShouldSetPanResponder: (_, g) => !!onDismiss && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => {
          dragged.current = true;
        },
        onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          setTimeout(() => (dragged.current = false), 350);
          if (Math.abs(g.dx) > 90) Animated.timing(x, { toValue: g.dx > 0 ? 600 : -600, duration: 160, useNativeDriver: false }).start(() => onDismiss?.());
          else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          setTimeout(() => (dragged.current = false), 350);
          Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
        },
      }),
    [onDismiss, x],
  );

  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center' }}>{s.icon(s.fg)}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body style={{ fontWeight: '600' }}>{broadcastText(b)}</Body>
        <Small>
          {showRide ? b.legLabel + ' · ' : ''}
          {timeAgo(b.createdAt)}
        </Small>
      </View>
      {onPress && !onDismiss && <ChevronRight size={20} color={colors.inkSoft} />}
      {onDismiss && (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <X size={20} color={colors.inkSoft} />
        </Pressable>
      )}
    </View>
  );
  const body = onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (!dragged.current) onPress();
      }}
      style={({ pressed }) => pressed && { opacity: 0.85 }}
    >
      {row}
    </Pressable>
  ) : (
    row
  );
  if (!onDismiss) return body;
  return (
    <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }], opacity: x.interpolate({ inputRange: [-300, 0, 300], outputRange: [0.2, 1, 0.2], extrapolate: 'clamp' }) }}>
      {body}
    </Animated.View>
  );
}

export function SwapCard({
  swap, mine, onAccept, onCancel, showRide = true,
}: {
  swap: Swap; mine: boolean; onAccept: () => Promise<void>; onCancel: () => Promise<void>; showRide?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError('Someone else may have just taken it. Check back in a moment.');
    }
    setBusy(false);
  }
  return (
    <View style={{ backgroundColor: colors.warnCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warnLine, padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ArrowLeftRight size={20} color={colors.warnFg} strokeWidth={2.25} />
        <Text style={[font.heading, { color: colors.ink, flex: 1 }]}>{mine ? 'You asked for a sub' : `${swap.requesterName.split(' ')[0]} needs a sub`}</Text>
      </View>
      <Body>
        {showRide ? `${swap.legLabel} · ` : ''}
        {`${prettyDate(swap.date)}, ${fmtTime(swap.start)}`}
      </Body>
      {error && <Small style={{ color: colors.danger }}>{error}</Small>}
      {mine ? (
        <Button variant="secondary" label="Cancel the request" loading={busy} onPress={() => run(onCancel)} />
      ) : (
        <Button label="I can drive" loading={busy} onPress={() => run(onAccept)} />
      )}
    </View>
  );
}
