import { ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowLeftRight, Check, ChevronRight, Clock, Flag, MapPin, Play, UserCheck } from 'lucide-react-native';
import { Broadcast, broadcastText, Swap, timeAgo } from '@/lib/social';
import { fmtTime, prettyDate } from '@/lib/schedule';
import { Body, Button, Small } from '@/components/ui';
import { colors, font, radius, space } from '@/theme';

const ICONS: Record<Broadcast['type'], { icon: (c: string) => ReactNode; bg: string; fg: string }> = {
  running_late: { icon: (c) => <Clock size={20} color={c} strokeWidth={2.25} />, bg: '#FBE9CF', fg: '#8A5300' },
  ride_started: { icon: (c) => <Play size={20} color={c} strokeWidth={2.25} />, bg: colors.accentSoft, fg: colors.accent },
  arriving: { icon: (c) => <MapPin size={20} color={c} strokeWidth={2.25} />, bg: colors.accentSoft, fg: colors.accent },
  picked_up: { icon: (c) => <Check size={20} color={c} strokeWidth={2.5} />, bg: colors.okSoft, fg: colors.ok },
  dropped_off: { icon: (c) => <Check size={20} color={c} strokeWidth={2.5} />, bg: colors.okSoft, fg: colors.ok },
  ride_completed: { icon: (c) => <Flag size={20} color={c} strokeWidth={2.25} />, bg: colors.okSoft, fg: colors.ok },
  swap_requested: { icon: (c) => <ArrowLeftRight size={20} color={c} strokeWidth={2.25} />, bg: '#FBE9CF', fg: '#8A5300' },
  swap_accepted: { icon: (c) => <UserCheck size={20} color={c} strokeWidth={2.25} />, bg: colors.okSoft, fg: colors.ok },
};

// A persistent in-app status line. Nothing important lives only in a push notification (brief §8).
export function UpdateRow({ b, showRide, onPress }: { b: Broadcast; showRide?: boolean; onPress?: () => void }) {
  const s = ICONS[b.type];
  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center' }}>{s.icon(s.fg)}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body style={{ fontWeight: '600' }}>{broadcastText(b)}</Body>
        <Small>
          {showRide ? `${b.legLabel} · ` : ''}
          {timeAgo(b.createdAt)}
        </Small>
      </View>
      {onPress && <ChevronRight size={20} color={colors.inkSoft} />}
    </View>
  );
  if (!onPress) return row;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {row}
    </Pressable>
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
    <View style={{ backgroundColor: '#FFF4DD', borderRadius: radius.md, borderWidth: 1, borderColor: '#F0D9A8', padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ArrowLeftRight size={20} color="#8A5300" strokeWidth={2.25} />
        <Text style={[font.heading, { color: colors.ink, flex: 1 }]}>{mine ? 'You asked for a sub' : `${swap.requesterName.split(' ')[0]} needs a sub`}</Text>
      </View>
      <Body>
        {showRide ? `${swap.legLabel} · ` : ''}
        {prettyDate(swap.date)}, {fmtTime(swap.start)}
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
