import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Bell, Check, ChevronRight, Sun } from 'lucide-react-native';
import { useCircle } from '@/lib/useCircle';
import { useSession } from '@/lib/session';
import { addDays, dirLabel, driverFor, effectiveWindow, fmtTime, isSkipped, Leg, prettyDate, rideLabel, runsOn, toISO } from '@/lib/schedule';
import { acceptSwap, cancelSwap, guardiansOf, runKey, sendBroadcast, startRun } from '@/lib/data';
import { Broadcast, Swap } from '@/lib/social';
import { SwapCard, UpdateRow } from '@/components/social';
import { initialKids, kidIdsOf, Run } from '@/lib/ride';
import { Avatar, Body, Button, Card, Heading, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';

type Item = {
  key: string;
  circleId: string;
  circleName: string;
  legId: string;
  date: string;
  title: string;
  dir: string; // Dropoff or Pickup
  start: string;
  driver: string;
  mine: boolean;
  status: 'scheduled' | 'started' | 'completed' | 'skipped';
  legLabel: string;
  driverId: string | null;
  driverName: string;
  driverColor?: string;
  kidsOn: { id: string; name: string; color?: string }[];
  kidIds: string[];
};
type Reminder = { key: string; circleId: string; legId: string; date: string; title: string; start: string };
type SwapRow = { circleId: string; key: string; swap: Swap };
type UpdateItem = { circleName: string; b: Broadcast };
type KidArc = { key: string; kidId: string; kidColor?: string; circleId: string; legId: string; date: string; kidName: string; step: number; label: string; place: string };
type Report = { items: Item[]; reminders: Reminder[]; swaps: SwapRow[]; updates: UpdateItem[]; arcs: KidArc[] };

const EMPTY: Report = { items: [], reminders: [], swaps: [], updates: [], arcs: [] };
const arcSteps = (place: string) => ['Dropoff complete', `At ${place}`, 'Pickup started', 'Home'];
const RECENT_MS = 12 * 60 * 60 * 1000;

// One invisible probe per circle reports what matters upward, so a screen can merge everything
// into a single list across every circle. `dates` is the days whose rides to report: just today
// for the Today tab, seven days for the Week tab. Reminders, updates, swaps and the kids' day
// always describe today.
function Probe({ circleId, dates, onReport }: { circleId: string; dates: string[]; onReport: (id: string, r: Report) => void }) {
  const { uid } = useSession();
  const { circle, members, kids, legs, overrides, days, runs, swaps, broadcasts, rotation, nameOf } = useCircle(circleId);
  const today = toISO(new Date());
  const tomorrow = addDays(today, 1);
  const datesKey = dates.join(',');

  const report = useMemo((): Report => {
    if (!circle) return EMPTY;
    const label = (leg: Leg) => rideLabel(circle.name, leg);
    const entries = Object.entries(legs);

    const items = dates.flatMap((date) =>
      entries
        .filter(([, leg]) => runsOn(leg, date))
        .map(([legId, leg]): Item => {
          const run = runs[runKey(legId, date)];
          const skipped = isSkipped(legId, date, overrides, days);
          const driver = run?.driverUid ?? driverFor(legId, leg, date, rotation, overrides, days);
          const status = (skipped ? 'skipped' : run?.status ?? 'scheduled') as Item['status'];
          return {
            key: `${circleId}_${legId}_${date}`,
            circleId,
            circleName: circle.name,
            legId,
            date,
            title: leg.name?.trim() || circle.name,
            dir: dirLabel(leg.direction),
            start: effectiveWindow(legId, leg, date, overrides).start,
            driver: driver ? nameOf(driver) : 'No driver yet',
            mine: driver === uid,
            status,
            legLabel: label(leg),
            driverId: driver ?? null,
            driverName: driver ? nameOf(driver) : 'No driver yet',
            driverColor: members.find((m) => m.uid === driver)?.color,
            kidIds: kidIdsOf(leg.stops),
            kidsOn: kidIdsOf(leg.stops).flatMap((kid) => {
              const k = kids.find((x) => x.id === kid);
              return k ? [{ id: k.id, name: k.name, color: k.color }] : [];
            }),
          };
        }),
    );

    // "You drive tomorrow": shown from 5pm the evening before.
    const reminders: Reminder[] =
      new Date().getHours() >= 17
        ? entries
            .filter(([legId, leg]) => runsOn(leg, tomorrow) && !isSkipped(legId, tomorrow, overrides, days))
            .filter(([legId, leg]) => driverFor(legId, leg, tomorrow, rotation, overrides, days) === uid)
            .map(([legId, leg]) => ({
              key: `${circleId}_${legId}_${tomorrow}`,
              circleId,
              legId,
              date: tomorrow,
              title: label(leg),
              start: effectiveWindow(legId, leg, tomorrow, overrides).start,
            }))
        : [];

    const openSwaps = Object.entries(swaps)
      .filter(([, s]) => s.status === 'open' && s.date >= today)
      .map(([key, swap]) => ({ circleId, key, swap }));

    const now = Date.now();
    const updates = broadcasts
      .filter((b) => now - b.createdAt < RECENT_MS && b.fromUid !== uid && b.type !== 'swap_requested')
      .map((b) => ({ circleName: circle.name, b }));

    // The day-long custody arc for each of my children (Uber ends at dropoff; a parent's day doesn't).
    const arcs: KidArc[] = [];
    const live = entries.filter(([legId, leg]) => runsOn(leg, today) && !isSkipped(legId, today, overrides, days));
    for (const kid of kids.filter((k) => !!uid && guardiansOf(k).includes(uid))) {
      // Every ride today that includes this child, not just the first: a duplicate ride or a second
      // driver's run must not hide what actually happened.
      const legsFor = (dir: 'AM' | 'PM') => live.filter(([, leg]) => leg.direction === dir && leg.stops.some((s) => s.kidIds.includes(kid.id)));
      const amLegs = legsFor('AM');
      const pmLegs = legsFor('PM');
      if (amLegs.length === 0 && pmLegs.length === 0) continue;
      const runsOf = (ls: typeof amLegs) => ls.map(([id]) => runs[runKey(id, today)]).filter((r): r is Run => !!r);
      const amRuns = runsOf(amLegs);
      const pmRuns = runsOf(pmLegs);
      const stateIn = (rs: Run[]) => rs.map((r) => r.kids?.[kid.id]);
      const amDone = stateIn(amRuns).includes('dropped_off');
      const pmHome = stateIn(pmRuns).includes('dropped_off');
      const amDoneAt = Math.max(0, ...amRuns.map((r) => r.completedAt ?? 0));
      // A ride the driver ended without confirming this child. Say what we do and don't know.
      const unconfirmed = (rs: Run[], arrival: string) =>
        stateIn(rs).includes('absent') ? "Didn't ride" : stateIn(rs).includes('picked_up') ? `Ride ended, ${arrival} not confirmed` : "Ride ended, pickup not confirmed";
      const am = amLegs[0];
      const pm = pmLegs[0];
      const first = (am ?? pm)!;
      let step = -1;
      const place = first[1].name?.trim() || 'school'; // where the child spends the middle of the day
      let label = am ? `Dropoff at ${fmtTime(effectiveWindow(am[0], am[1], today, overrides).start)}` : `Pickup at ${fmtTime(effectiveWindow(pm![0], pm![1], today, overrides).start)}`;
      let target = first;
      if (pmHome) { step = 3; label = 'Home safe'; target = pm!; }
      else if (pmRuns.some((r) => r.status === 'started')) { step = 2; label = 'On the way home'; target = pm!; }
      else if (pmRuns.some((r) => r.status === 'completed')) { step = amDone ? 1 : -1; label = unconfirmed(pmRuns, 'arrival home'); target = pm!; }
      else if (amDone) { step = Date.now() - amDoneAt < 10 * 60 * 1000 ? 0 : 1; label = step === 0 ? `Dropped off at ${place}` : `At ${place}`; target = pm ?? am!; }
      else if (amRuns.some((r) => r.status === 'started')) { label = 'On the way'; }
      else if (amRuns.some((r) => r.status === 'completed')) { label = unconfirmed(amRuns, `arrival at ${place}`); }
      arcs.push({ key: `${circleId}_${kid.id}`, kidId: kid.id, kidColor: kid.color, circleId, legId: target[0], date: today, kidName: kid.name, step, label, place });
    }

    return { items, reminders, swaps: openSwaps, updates, arcs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle, members, kids, legs, overrides, days, runs, swaps, broadcasts, rotation, uid, today, datesKey]);

  useEffect(() => onReport(circleId, report), [report, circleId, onReport]);
  return null;
}

// Collects the reports from one probe per circle.
function useReports(circleIds: string[]) {
  const [byCircle, setByCircle] = useState<Record<string, Report>>({});
  const onReport = useMemo(() => (id: string, r: Report) => setByCircle((b) => ({ ...b, [id]: r })), []);
  const ready = circleIds.every((id) => !!byCircle[id]);
  const reports = circleIds.map((id) => byCircle[id] ?? EMPTY);
  return { reports, onReport, ready };
}

// ---------- the Today tab ----------
export default function TodayFeed({ circleIds }: { circleIds: string[] }) {
  const { uid, profile } = useSession();
  const today = useMemo(() => [toISO(new Date())], []);
  const { reports, onReport, ready } = useReports(circleIds);

  const items = reports.flatMap((r) => r.items).sort((a, b) => a.start.localeCompare(b.start));
  const reminders = reports.flatMap((r) => r.reminders);
  const arcs = reports.flatMap((r) => r.arcs);
  const swaps = reports.flatMap((r) => r.swaps).sort((a, b) => a.swap.date.localeCompare(b.swap.date));
  const updates = reports
    .flatMap((r) => r.updates)
    .sort((a, b) => b.b.createdAt - a.b.createdAt)
    .slice(0, 3);
  const myName = profile?.name ?? 'A parent';
  const nothing = items.length + reminders.length + arcs.length + swaps.length + updates.length === 0;

  return (
    <>
      {circleIds.map((id) => (
        <Probe key={id} circleId={id} dates={today} onReport={onReport} />
      ))}

      {ready && nothing && (
        <Card style={{ alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Sun size={24} color={colors.accent} strokeWidth={2} />
          </View>
          <Heading>Nothing on today</Heading>
          <Body soft>No rides are scheduled today. Check the Week tab to see what is coming up.</Body>
        </Card>
      )}

      {swaps.length > 0 && uid && (
        <View style={{ gap: space.sm }}>
          <Heading>Needs a driver</Heading>
          {swaps.map(({ circleId, key, swap }) => (
            <SwapCard
              key={`${circleId}_${key}`}
              swap={swap}
              mine={swap.requesterUid === uid}
              onCancel={() => cancelSwap(circleId, key)}
              onAccept={async () => {
                await acceptSwap(circleId, key, { uid, name: myName });
                await sendBroadcast(circleId, { type: 'swap_accepted', fromUid: uid, fromName: myName, legId: swap.legId, legLabel: swap.legLabel, date: swap.date }).catch(() => {});
              }}
            />
          ))}
        </View>
      )}

      {reminders.length > 0 && (
        <View style={{ gap: space.sm }}>
          {reminders.map((r) => (
            <Card key={r.key} onPress={() => router.push(`/circle/${r.circleId}/ride/${r.legId}?date=${r.date}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
              <Bell size={22} color={colors.accent} strokeWidth={2.25} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '700' }}>You drive tomorrow</Body>
                <Small>
                  {r.title} · {fmtTime(r.start)}
                </Small>
              </View>
              <ChevronRight size={20} color={colors.accent} />
            </Card>
          ))}
        </View>
      )}

      {updates.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Heading>Latest updates</Heading>
          {updates.map((u, i) => (
            <UpdateRow key={`${u.b.createdAt}_${i}`} b={u.b} showRide />
          ))}
        </View>
      )}

      {arcs.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Heading>Your kids today</Heading>
          {arcs.map((a) => (
            <Card key={a.key} onPress={() => router.push(`/circle/${a.circleId}/ride/${a.legId}?date=${a.date}`)} style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar name={a.kidName} size={44} id={a.kidId} colorKey={a.kidColor} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{a.kidName.split(' ')[0]}</Body>
                  <Small>{a.label}</Small>
                </View>
                <ChevronRight size={20} color={colors.inkSoft} />
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {arcSteps(a.place).map((s, i) => (
                  <View key={s} style={{ flex: 1, gap: 6 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= a.step ? colors.accent : colors.line }} />
                    <Small style={{ fontSize: 11, lineHeight: 14, color: i === a.step ? colors.ink : colors.inkSoft, fontWeight: i === a.step ? '700' : '500' }}>{s}</Small>
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </View>
      )}

      {items.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Heading>Rides today</Heading>
          {items.map((it) => (
            <RideCard key={it.key} it={it} showCircle={circleIds.length > 1} />
          ))}
        </View>
      )}
    </>
  );
}

// ---------- the Week tab ----------
export function WeekFeed({ circleIds, weekStart }: { circleIds: string[]; weekStart: string }) {
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const { reports, onReport, ready } = useReports(circleIds);
  const all = reports.flatMap((r) => r.items);
  const byDate = (d: string) => all.filter((i) => i.date === d).sort((a, b) => a.start.localeCompare(b.start));
  const busyDays = dates.filter((d) => byDate(d).length > 0);
  const today = toISO(new Date());

  return (
    <>
      {circleIds.map((id) => (
        <Probe key={`${id}_${weekStart}`} circleId={id} dates={dates} onReport={onReport} />
      ))}
      {ready && busyDays.length === 0 && (
        <Card style={{ gap: space.sm }}>
          <Heading>Nothing scheduled this week</Heading>
          <Body soft>No rides run in these days. Try another week, or add rides from a circle.</Body>
        </Card>
      )}
      {busyDays.map((d) => (
        <View key={d} style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
            <Heading>{prettyDate(d)}</Heading>
            {d === today && (
              <View style={{ backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
                <Small style={{ color: '#fff' }}>Today</Small>
              </View>
            )}
          </View>
          {byDate(d).map((it) => (
            <RideCard key={it.key} it={it} showCircle={circleIds.length > 1} />
          ))}
        </View>
      ))}
    </>
  );
}

// One ride in a list. The driver's colored avatar leads, so scrolling down the left edge tells you
// who is driving each ride at a glance. Time and ride name share the top line; the second line says
// dropoff or pickup, who is going, and who drives. A status badge appears only when it says something
// (live, done, skipped): "scheduled" is the default and would just be noise on every row.
// Tapping the card opens the ride. When it is YOUR ride and about to begin (within an hour of its
// start, today), two buttons appear: View, and Start leg, which starts it right here so the driver
// saves a tap. Every other card stays plain.
function RideCard({ it, showCircle }: { it: Item; showCircle: boolean }) {
  const { uid, profile } = useSession();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const kidNames = it.kidsOn.map((k) => k.name.split(' ')[0]).join(', ');
  const driver = it.mine ? 'You drive' : `${it.driverName.split(' ')[0]} drives`;
  const open = () => router.push(`/circle/${it.circleId}/ride/${it.legId}?date=${it.date}`);

  // The Start button appears on its own as the ride's time approaches, so check the clock every minute.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const now = new Date();
  const [h, m] = it.start.split(':').map(Number);
  const canStart = it.mine && it.status === 'scheduled' && it.date === toISO(now) && now.getHours() * 60 + now.getMinutes() >= h * 60 + m - 60;

  async function start() {
    if (!uid) return;
    setBusy(true);
    try {
      const name = profile?.name ?? 'A parent';
      await startRun(it.circleId, runKey(it.legId, it.date), uid, initialKids(it.kidIds), false);
      await sendBroadcast(it.circleId, { type: 'ride_started', fromUid: uid, fromName: name, legId: it.legId, legLabel: it.legLabel, date: it.date }).catch(() => {});
      open(); // sharing the car's location begins once the ride screen is open
    } catch {
      setBusy(false);
    }
  }

  return (
    <Card onPress={it.status === 'skipped' ? undefined : open} style={{ gap: space.sm, paddingVertical: space.sm + 4, opacity: it.status === 'skipped' ? 0.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={it.driverName} size={44} id={it.driverId ?? undefined} colorKey={it.driverColor} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Heading>{fmtTime(it.start)}</Heading>
            <Body style={{ fontWeight: '700', flex: 1 }}>{it.title}</Body>
            {it.status === 'completed' && (
              <View accessibilityLabel="Done" style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.okSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={16} color={colors.ok} strokeWidth={3} />
              </View>
            )}
            {(it.status === 'started' || it.status === 'skipped') && <StatusDot status={it.status} />}
          </View>
          <Small>
            {showCircle ? `${it.circleName} · ` : ''}
            {it.dir}
            {kidNames ? ` · ${kidNames}` : ''} · {driver}
          </Small>
        </View>
      </View>
      {canStart && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" label="View" onPress={open} disabled={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Start leg" onPress={start} loading={busy} />
          </View>
        </View>
      )}
    </Card>
  );
}

function StatusDot({ status }: { status: Item['status'] }) {
  const m = {
    scheduled: { t: 'Scheduled', bg: colors.sunk, fg: colors.inkSoft },
    started: { t: 'Live', bg: colors.accent, fg: '#fff' },
    completed: { t: 'Done', bg: colors.okSoft, fg: colors.ok },
    skipped: { t: 'Skipped', bg: colors.sunk, fg: colors.inkSoft },
  }[status];
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Small style={{ color: m.fg, fontWeight: '700' }}>{m.t}</Small>
    </View>
  );
}
