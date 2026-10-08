import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, CalendarDays, Car, Check, ChevronRight, Link2, Pencil, Plus } from 'lucide-react-native';
import { guardiansOf, handOverMember, isOrganizer, PUBLIC_URL, renameCircle, saveRotation, setCoOrganizers } from '@/lib/data';
import { kidIdsOf } from '@/lib/ride';
import { useSession } from '@/lib/session';
import { useCircle } from '@/lib/useCircle';
import { fairness, fmtTime, rideTitle, toISO, WEEKDAY_SHORT } from '@/lib/schedule';
import { Avatar, Body, Button, Card, Centered, Chip, EmptyState, ErrorNote, Field, Gap, Heading, Screen, Small, Title, Wrap } from '@/components/ui';
import { colors, space } from '@/theme';

export default function CircleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { uid } = useSession();
  const { circle, members, kids, legs, overrides, days, rotation, nameOf } = useCircle(id);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
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

  const isAdmin = isOrganizer(circle, uid);
  const isOwner = circle.adminUid === uid; // only the person who started the circle can promote others
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

  async function saveName() {
    setRenameBusy(true);
    setRenameError(null);
    try {
      await renameCircle(id, draft);
      setRenaming(false);
    } catch {
      setRenameError('Could not rename the circle. Try again in a moment.');
    }
    setRenameBusy(false);
  }

  const byOwner = (owner: string) => kids.filter((k) => k.ownerUid === owner);
  const legList = Object.entries(legs).sort(([, a], [, b]) => a.windowStart.localeCompare(b.windowStart));
  const maxScore = Math.max(1, ...Object.values(score));

  return (
    <Screen back>
      {renaming ? (
        <Card style={{ gap: space.sm }}>
          <Field label="Circle name" value={draft} onChangeText={setDraft} autoCapitalize="words" maxLength={40} />
          <ErrorNote message={renameError} />
          <Button label="Save name" onPress={saveName} loading={renameBusy} disabled={!draft.trim() || draft.trim() === circle.name} />
          <Button variant="ghost" label="Cancel" onPress={() => setRenaming(false)} disabled={renameBusy} />
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Title>{circle.name}</Title>
          </View>
          {isAdmin && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rename circle"
              onPress={() => {
                setDraft(circle.name);
                setRenaming(true);
              }}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunk }}
            >
              <Pencil size={20} color={colors.ink} strokeWidth={2.25} />
            </Pressable>
          )}
        </View>
      )}

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
        <EmptyState
          icon={<CalendarDays size={24} color={colors.accent} strokeWidth={2} />}
          title="No rides yet"
          body={isAdmin ? 'Add the morning dropoff or the afternoon pickup. The app takes turns between drivers for you.' : 'The organizer has not set up any rides yet. They will show up here.'}
          action={isAdmin ? { label: 'Add the first ride', icon: <Plus size={22} color="#fff" strokeWidth={2.5} />, onPress: () => router.push('/circle/' + id + '/leg/new') } : undefined}
        />
      ) : (
        legList.map(([legId, leg]) => {
          const riders = kidIdsOf(leg.stops).flatMap((kidId) => {
            const k = kids.find((x) => x.id === kidId);
            return k ? [k] : [];
          });
          const fixed = leg.driverMode === 'fixed' ? members.find((m) => m.uid === leg.fixedUid) : undefined;
          return (
            <Card key={legId} onPress={isAdmin ? () => router.push(`/circle/${id}/leg/${legId}`) : undefined} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Heading>{rideTitle(leg)}</Heading>
                  <Small>
                    {leg.date ? 'One day only' : leg.days.map((d) => WEEKDAY_SHORT[d - 1]).join(' · ')} · {fmtTime(leg.windowStart)}
                    {leg.windowEnd ? `–${fmtTime(leg.windowEnd)}` : ''}
                  </Small>
                  <Small>
                    {leg.stops.length} stop{leg.stops.length === 1 ? '' : 's'}
                  </Small>
                </View>
                {isAdmin && <ChevronRight size={22} color={colors.inkSoft} />}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                  {riders.slice(0, 4).map((k, i) => (
                    <View key={k.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                      <Avatar name={k.name} size={28} id={k.id} colorKey={k.color} ring />
                    </View>
                  ))}
                  {riders.length > 0 && (
                    <Small style={{ marginLeft: space.sm, flexShrink: 1 }}>{riders.map((k) => k.name.split(' ')[0]).join(', ')}</Small>
                  )}
                </View>
                {fixed ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Small style={{ color: colors.ink, fontWeight: '600' }}>Always {fixed.name.split(' ')[0]}</Small>
                    <Avatar name={fixed.name} size={32} id={fixed.uid} colorKey={fixed.color} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Small style={{ color: colors.ink, fontWeight: '600' }}>Taking turns</Small>
                    <View style={{ flexDirection: 'row' }}>
                      {rotation.slice(0, 4).map((u, i) => {
                        const m = members.find((x) => x.uid === u);
                        return (
                          <View key={u} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                            <Avatar name={m?.name ?? '?'} size={32} id={u} colorKey={m?.color} ring />
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            </Card>
          );
        })
      )}
      {isAdmin && legList.length > 0 && (
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
              <Avatar name={nameOf(u)} size={32} id={u} colorKey={members.find((m) => m.uid === u)?.color} />
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
            <Avatar name={m.name} id={m.uid} colorKey={m.color} />
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
            {isOrganizer(circle, m.uid) && <Small>Organizer</Small>}
          </View>
          {byOwner(m.uid).map((k) => (
            <Card
              key={k.id}
              onPress={uid && guardiansOf(k).includes(uid) ? () => router.push(`/circle/${id}/kid/${k.id}`) : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bg, padding: space.sm }}
            >
              <Avatar name={k.name} size={40} id={k.id} colorKey={k.color} />
              <View style={{ flex: 1 }}>
                <Body>{k.name}</Body>
                {k.notes ? <Small>{k.notes}</Small> : null}
              </View>
            </Card>
          ))}
          {isOwner && m.uid !== uid && (
            <Button
              variant="ghost"
              label={circle.coOrganizerUids?.includes(m.uid) ? 'Remove as organizer' : 'Make organizer'}
              onPress={() =>
                setCoOrganizers(
                  id,
                  circle.coOrganizerUids?.includes(m.uid) ? circle.coOrganizerUids.filter((x) => x !== m.uid) : [...(circle.coOrganizerUids ?? []), m.uid],
                )
              }
            />
          )}
          {isOrganizer(circle, uid) && m.uid !== uid && m.uid !== circle.adminUid && members.length > 2 && (
            <HandOver circleId={id} oldUid={m.uid} oldName={m.name} others={members.filter((x) => x.uid !== m.uid && x.uid !== uid)} today={today} />
          )}
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

// For an organizer: a parent lost their sign-in (new phone, cleared browser) and came back as a new person.
// Pick the new card and everything the old one held moves across; then the old card goes away.
function HandOver({ circleId, oldUid, oldName, others, today }: { circleId: string; oldUid: string; oldName: string; others: { uid: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  if (done) return <Small style={{ color: colors.ok, fontWeight: '600' }}>Handed over: {done.join(', ')}.</Small>;
  if (!open) return <Button variant="ghost" label="Back on a new phone?" onPress={() => setOpen(true)} />;
  async function go() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await handOverMember(circleId, oldUid, target, today));
    } catch {
      setError('Could not finish the hand-over. Nothing is lost; you can try again.');
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: space.sm }}>
      <Body style={{ fontWeight: '600' }}>Which card is {oldName.split(' ')[0]}'s new phone?</Body>
      <Small>The new card has to be in this circle already (they join with the invite link). Their rides, turns and children move to it, and this old card is removed.</Small>
      <Wrap>
        {others.map((o) => (
          <Chip key={o.uid} label={o.name} on={target === o.uid} onPress={() => setTarget(o.uid)} />
        ))}
      </Wrap>
      <ErrorNote message={error} />
      <Button label="Hand over" onPress={go} loading={busy} disabled={!target} />
      <Button variant="ghost" label="Never mind" onPress={() => setOpen(false)} disabled={busy} />
    </View>
  );
}
