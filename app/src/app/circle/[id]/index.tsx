import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, CalendarDays, Car, Check, ChevronRight, Link2, Plus } from 'lucide-react-native';
import { PUBLIC_URL, saveRotation } from '@/lib/data';
import { useSession } from '@/lib/session';
import { useCircle } from '@/lib/useCircle';
import { fairness, fmtTime, toISO, WEEKDAY_SHORT } from '@/lib/schedule';
import { Avatar, Body, Button, Card, Centered, Gap, Heading, Screen, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

export default function CircleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { uid } = useSession();
  const { circle, members, kids, legs, overrides, days, rotation, nameOf } = useCircle(id);
  const [copied, setCopied] = useState(false);
  const today = toISO(new Date());

  const score = useMemo(() => fairness(legs, rotation, overrides, days, today), [legs, rotation, overrides, days, today]);

  if (circle === undefined)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  if (circle === null)
    return (
      <Screen back>
        <Title>Circle not found</Title>
        <Body soft>Either it does not exist or you are not a member. Open the invite link you were sent to join.</Body>
      </Screen>
    );

  const isAdmin = circle.adminUid === uid;
  const link = `${Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : PUBLIC_URL}/join/${circle.inviteCode}`;

  async function shareLink() {
    const message = `Join our carpool circle "${circle!.name}": ${link}`;
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
        if (nav.share) await nav.share({ text: message });
        else {
          await navigator.clipboard.writeText(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }
      } else {
        await Share.share({ message });
      }
    } catch {
      // Share sheet dismissed; nothing to do.
    }
  }

  function move(i: number, delta: number) {
    const next = [...rotation];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    saveRotation(id, next);
  }

  const byOwner = (owner: string) => kids.filter((k) => k.ownerUid === owner);
  const legList = Object.entries(legs).sort(([, a], [, b]) => a.windowStart.localeCompare(b.windowStart));
  const maxScore = Math.max(1, ...Object.values(score));

  return (
    <Screen back>
      <Title>{circle.name}</Title>

      <Card onPress={() => router.push(`/circle/${id}/agenda`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <CalendarDays size={24} color={colors.accent} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Heading>This week</Heading>
          <Small>Who drives what, and when</Small>
        </View>
        <ChevronRight size={22} color={colors.inkSoft} />
      </Card>

      <Gap size="xs" />
      <Heading>Rides</Heading>
      {legList.length === 0 ? (
        <Card style={{ gap: space.sm }}>
          <Body soft>
            {isAdmin
              ? 'No rides yet. Add the morning dropoff or afternoon pickup and the app will rotate drivers for you.'
              : 'The organizer has not set up any rides yet.'}
          </Body>
        </Card>
      ) : (
        legList.map(([legId, leg]) => (
          <Card
            key={legId}
            onPress={isAdmin ? () => router.push(`/circle/${id}/leg/${legId}`) : undefined}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
          >
            <View style={{ flex: 1 }}>
              <Heading>{leg.direction === 'AM' ? 'Morning dropoff' : 'Afternoon pickup'}</Heading>
              <Small>
                {leg.date ? 'One day only' : leg.days.map((d) => WEEKDAY_SHORT[d - 1]).join(' · ')} · {fmtTime(leg.windowStart)}
                {leg.windowEnd ? `–${fmtTime(leg.windowEnd)}` : ''}
              </Small>
              <Small>
                {leg.stops.length} stop{leg.stops.length === 1 ? '' : 's'} ·{' '}
                {leg.driverMode === 'fixed' ? `Always ${nameOf(leg.fixedUid ?? null)}` : 'Rotating drivers'}
              </Small>
            </View>
            {isAdmin && <ChevronRight size={22} color={colors.inkSoft} />}
          </Card>
        ))
      )}
      {isAdmin && (
        <Button variant="secondary" label="Add a ride" icon={<Plus size={20} color={colors.ink} strokeWidth={2.5} />} onPress={() => router.push(`/circle/${id}/leg/new`)} />
      )}

      <Gap size="xs" />
      <Heading>Driving order and fairness</Heading>
      <Card style={{ gap: space.md }}>
        <Small>
          Each ride you drive counts as one. Drivers take turns in this order{isAdmin ? ' (you can reorder it)' : ''}.
        </Small>
        {rotation.map((u, i) => (
          <View key={u} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Body style={{ width: 24, fontWeight: '700' }}>{i + 1}</Body>
              <View style={{ flex: 1 }}>
                <Body>{nameOf(u)}</Body>
              </View>
              <Body style={{ fontWeight: '700' }}>{score[u] ?? 0}</Body>
              {isAdmin && (
                <>
                  <ReorderButton label="Move up" disabled={i === 0} onPress={() => move(i, -1)} icon={<ArrowUp size={20} color={colors.ink} />} />
                  <ReorderButton label="Move down" disabled={i === rotation.length - 1} onPress={() => move(i, 1)} icon={<ArrowDown size={20} color={colors.ink} />} />
                </>
              )}
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.sunk, marginLeft: 32 }}>
              <View style={{ height: 8, borderRadius: 4, width: `${((score[u] ?? 0) / maxScore) * 100}%`, backgroundColor: colors.accent }} />
            </View>
          </View>
        ))}
      </Card>

      <Gap size="xs" />
      <Heading>Invite families</Heading>
      <Card style={{ gap: space.sm }}>
        <Body soft>Anyone with this link can join. Only share it with parents you know.</Body>
        <Button
          variant="secondary"
          label={copied ? 'Link copied' : 'Send invite link'}
          icon={copied ? <Check size={20} color={colors.ok} strokeWidth={2.5} /> : <Link2 size={20} color={colors.ink} strokeWidth={2.25} />}
          onPress={shareLink}
        />
      </Card>

      <Gap size="xs" />
      <Heading>Families</Heading>
      {members.map((m) => (
        <Card key={m.uid} style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={m.name} tone="sun" />
            <View style={{ flex: 1 }}>
              <Heading>
                {m.name}
                {m.uid === uid ? ' (you)' : ''}
              </Heading>
              {m.car ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Car size={14} color={colors.inkSoft} />
                  <Small>{m.car}</Small>
                </View>
              ) : null}
            </View>
            {m.role === 'admin' && <Small>Organizer</Small>}
          </View>
          {byOwner(m.uid).map((k) => (
            <Card
              key={k.id}
              onPress={m.uid === uid ? () => router.push(`/circle/${id}/kid/${k.id}`) : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bg, padding: space.sm }}
            >
              <Avatar name={k.name} size={40} />
              <View style={{ flex: 1 }}>
                <Body>{k.name}</Body>
                {k.notes ? <Small>{k.notes}</Small> : null}
              </View>
            </Card>
          ))}
          {m.uid === uid && (
            <Button variant="ghost" label="Add a child" icon={<Plus size={20} color={colors.ink} strokeWidth={2.5} />} onPress={() => router.push(`/circle/${id}/kid/new`)} />
          )}
        </Card>
      ))}
    </Screen>
  );
}

function ReorderButton({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled: boolean; icon: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunk, opacity: disabled ? 0.35 : 1 }}
    >
      {icon}
    </Pressable>
  );
}
