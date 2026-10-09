import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, CircleSlash } from 'lucide-react-native';
import { acceptSwap, cancelSwap, isOrganizer, requestSwap, saveDay, saveOverride, sendBroadcast } from '@/lib/data';
import { SwapCard } from '@/components/social';
import { useSession } from '@/lib/session';
import { useCircle } from '@/lib/useCircle';
import {
  addDays, driverFor, effectiveWindow, fmtTime, isoWeekday, mondayOf, overrideKey, parseTime, prettyDate, rideLabel, rideTitle, runsOn, shortDate, toISO,
} from '@/lib/schedule';
import { Avatar, Body, Button, Card, Centered, Chip, ErrorNote, Field, Gap, Heading, Screen, Small, Title, Wrap } from '@/components/ui';
import { colors, radius, space } from '@/theme';

export default function Agenda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { uid, profile } = useSession();
  const { circle, members, legs, overrides, days, runs, swaps, rotation, nameOf } = useCircle(id);
  const today = toISO(new Date());
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [editing, setEditing] = useState<string | null>(null); // `${legId}_${date}` or `day_${date}`

  if (!circle)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  const isAdmin = isOrganizer(circle, uid);

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const legEntries = Object.entries(legs);

  const rows = week
    .map((date) => {
      const items = legEntries
        .filter(([, leg]) => runsOn(leg, date))
        .map(([legId, leg]) => ({ legId, leg, win: effectiveWindow(legId, leg, date, overrides) }))
        .sort((a, b) => a.win.start.localeCompare(b.win.start));
      return { date, items };
    })
    .filter((r) => r.items.length > 0 || days[r.date]);

  return (
    <Screen back>
      <Title>{circle.name}</Title>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <NavBtn label="Previous week" onPress={() => setWeekStart(addDays(weekStart, -7))} icon={<ChevronLeft size={22} color={colors.ink} />} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Heading>
            {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
          </Heading>
          {weekStart !== mondayOf(today) && (
            <Pressable accessibilityRole="button" onPress={() => setWeekStart(mondayOf(today))} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Small style={{ color: colors.accent }}>Back to this week</Small>
            </Pressable>
          )}
        </View>
        <NavBtn label="Next week" onPress={() => setWeekStart(addDays(weekStart, 7))} icon={<ChevronRight size={22} color={colors.ink} />} />
      </View>

      {rows.length === 0 && (
        <Card style={{ gap: space.sm }}>
          <Heading>Nothing scheduled this week</Heading>
          <Body soft>
            {legEntries.length === 0
              ? 'Add a ride from the circle page and it will show up here.'
              : 'No rides run this week. Try the next one.'}
          </Body>
        </Card>
      )}

      {rows.map(({ date, items }) => {
        const day = days[date];
        const dayKey = `day_${date}`;
        return (
          <View key={date} style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
              <Heading>{prettyDate(date)}</Heading>
              {date === today && (
                <View style={{ backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
                  <Small style={{ color: colors.onAccent }}>Today</Small>
                </View>
              )}
              <View style={{ flex: 1 }} />
              {isAdmin && (
                <Pressable accessibilityRole="button" accessibilityLabel={day?.skip ? 'Edit this day' : 'Skip this day'} onPress={() => setEditing(editing === dayKey ? null : dayKey)} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Small style={{ color: colors.accent }}>{day?.skip ? 'Edit' : 'Skip day'}</Small>
                </Pressable>
              )}
            </View>
            {day?.skip && (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.sunk }}>
                <CircleSlash size={18} color={colors.inkSoft} />
                <Body soft>No carpool{day.note ? `: ${day.note}` : ''}</Body>
              </Card>
            )}
            {editing === dayKey && <DayEditor circleId={id} date={date} initialNote={day?.note ?? ''} skipped={!!day?.skip} onDone={() => setEditing(null)} />}

            {items.map(({ legId, leg, win }) => {
              const key = overrideKey(legId, date);
              const o = overrides[key];
              const skipped = !!day?.skip || !!o?.skip;
              const driver = driverFor(legId, leg, date, rotation, overrides, days);
              const changed = !!o?.windowStart || !!o?.windowEnd;
              return (
                <View key={legId} style={{ gap: space.sm }}>
                  <Card
                    onPress={isAdmin && !day?.skip ? () => setEditing(editing === key ? null : key) : undefined}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: skipped ? 0.5 : 1 }}
                  >
                    <Avatar name={driver ? nameOf(driver) : '?'} id={driver ?? undefined} colorKey={members.find((m) => m.uid === driver)?.color} />
                    <View style={{ flex: 1 }}>
                      <Heading>{rideTitle(leg)}</Heading>
                      <Body soft>{skipped ? 'Skipped' : driver ? `${nameOf(driver)}${driver === uid ? ' (you)' : ''} drives` : 'No driver yet'}</Body>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Heading>{fmtTime(win.start)}</Heading>
                      {win.end ? <Small>to {fmtTime(win.end)}</Small> : null}
                      {changed && <Small style={{ color: colors.accent }}>Changed</Small>}
                    </View>
                  </Card>
                  {o?.note && !skipped ? <Small style={{ marginLeft: space.sm }}>{o.note}</Small> : null}
                  {(() => {
                    const swap = swaps[key];
                    const open = swap?.status === 'open' ? swap : undefined;
                    const label = rideLabel(circle.name, leg);
                    const myName = profile?.name ?? 'A parent';
                    if (skipped || !uid) return null;
                    if (open)
                      return (
                        <SwapCard
                          swap={open}
                          mine={open.requesterUid === uid}
                          showRide={false}
                          onCancel={() => cancelSwap(id, key)}
                          onAccept={async () => {
                            await acceptSwap(id, key, { uid, name: myName });
                            await sendBroadcast(id, { type: 'swap_accepted', fromUid: uid, fromName: myName, legId, legLabel: label, date }).catch(() => {});
                          }}
                        />
                      );
                    if (driver === uid && !runs[key] && date >= today)
                      return (
                        <Pressable
                          accessibilityRole="button"
                          style={{ minHeight: 44, justifyContent: 'center', marginLeft: space.sm }}
                          onPress={async () => {
                            await requestSwap(id, key, { legId, date, legLabel: label, start: leg.windowStart, requesterUid: uid, requesterName: myName }, swap?.status === 'cancelled');
                            await sendBroadcast(id, { type: 'swap_requested', fromUid: uid, fromName: myName, legId, legLabel: label, date }).catch(() => {});
                          }}
                        >
                          <Small style={{ color: colors.accent, fontWeight: '700' }}>Need a sub</Small>
                        </Pressable>
                      );
                    return null;
                  })()}
                  {!skipped && (
                    <Pressable accessibilityRole="button" onPress={() => router.push(`/circle/${id}/ride/${legId}?date=${date}`)} style={{ minHeight: 44, justifyContent: 'center', marginLeft: space.sm }}>
                      <Small style={{ color: colors.accent, fontWeight: '700' }}>{runs[overrideKey(legId, date)]?.status === 'started' ? 'Watch live' : 'Open ride'}</Small>
                    </Pressable>
                  )}
                  {editing === key && (
                    <LegDayEditor
                      circleId={id}
                      keyId={key}
                      start={leg.windowStart}
                      end={leg.windowEnd}
                      override={o}
                      members={members}
                      normalDriver={driverFor(legId, leg, date, rotation, { ...overrides, [key]: { ...o, driverUid: undefined } }, days)}
                      onDone={() => setEditing(null)}
                    />
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
      <Gap />
    </Screen>
  );
}

function NavBtn({ label, onPress, icon }: { label: string; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunk }}
    >
      {icon}
    </Pressable>
  );
}

function DayEditor({ circleId, date, initialNote, skipped, onDone }: { circleId: string; date: string; initialNote: string; skipped: boolean; onDone: () => void }) {
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(info: { skip?: boolean; note?: string }) {
    setBusy(true);
    try {
      await saveDay(circleId, date, info);
      onDone();
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: space.md }}>
      <Field label="Why no carpool? (optional)" value={note} onChangeText={setNote} placeholder="Teacher workday" />
      <ErrorNote message={error} />
      <Button label={skipped ? 'Save note' : 'Skip this whole day'} loading={busy} onPress={() => run({ skip: true, ...(note.trim() ? { note: note.trim() } : {}) })} />
      {skipped && <Button variant="secondary" label="Restore this day" disabled={busy} onPress={() => run({})} />}
    </Card>
  );
}

function LegDayEditor({
  circleId, keyId, start, end, override, members, normalDriver, onDone,
}: {
  circleId: string; keyId: string; start: string; end: string; override?: { skip?: boolean; windowStart?: string; windowEnd?: string; note?: string; driverUid?: string }; members: { uid: string; name: string }[]; normalDriver: string | null; onDone: () => void;
}) {
  const [s, setS] = useState(fmtTime(override?.windowStart ?? start));
  const [e, setE] = useState(override?.windowEnd ?? end ? fmtTime(override?.windowEnd ?? end) : '');
  const [note, setNote] = useState(override?.note ?? '');
  const [driver, setDriver] = useState<string | null>(override?.driverUid ?? null); // null = the normal driver
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(extra: { skip?: boolean } = {}) {
    const ps = parseTime(s);
    const pe = e.trim() ? parseTime(e) : null;
    if (!ps || (e.trim() && !pe)) return setError('Times should look like 1:00 PM.');
    setBusy(true);
    try {
      await saveOverride(circleId, keyId, {
        ...(driver ? { driverUid: driver } : {}),
        ...(ps !== start ? { windowStart: ps } : {}),
        ...(pe && pe !== end ? { windowEnd: pe } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...extra,
      });
      onDone();
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: space.md }}>
      <Field label="Starts around" value={s} onChangeText={setS} />
      <Field label="Ends around (optional)" value={e} onChangeText={setE} />
      <View style={{ gap: space.sm }}>
        <Body style={{ fontWeight: '600' }}>Who drives this day</Body>
        <Small>Changes only this day. The normal driver goes back to normal the next day.</Small>
        <Wrap>
          {members.map((m) => (
            <Chip
              key={m.uid}
              label={m.name}
              on={(driver ?? normalDriver) === m.uid}
              onPress={() => setDriver(m.uid === normalDriver ? null : m.uid)}
            />
          ))}
        </Wrap>
      </View>
      <Field label="Note for this day" value={note} onChangeText={setNote} placeholder="Early dismissal at 1:00" />
      <ErrorNote message={error} />
      <Button label="Save for this day" loading={busy} onPress={() => save()} />
      <Button variant="secondary" label={override?.skip ? 'Run this ride again' : 'Skip this ride'} disabled={busy} onPress={() => (override?.skip ? saveOverride(circleId, keyId, { ...override, skip: undefined }).then(onDone) : save({ skip: true }))} />
      {override && Object.keys(override).length > 0 && <Button variant="ghost" label="Reset to the normal schedule" disabled={busy} onPress={() => saveOverride(circleId, keyId, {}).then(onDone)} />}
    </Card>
  );
}
