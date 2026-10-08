import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, Check, ChevronRight, Sun } from 'lucide-react-native';
import { useCircle } from '@/lib/useCircle';
import { useSession } from '@/lib/session';
import { addDays, dirLabel, driverFor, effectiveWindow, fmtTime, isSkipped, Leg, prettyDate, rideLabel, runsOn, toISO } from '@/lib/schedule';
import { acceptSwap, cancelSwap, guardiansOf, runKey, sendBroadcast, startRun } from '@/lib/data';
import { Broadcast, newestFirst, Swap } from '@/lib/social';
import { SwapCard, UpdateRow } from '@/components/social';
import { useDismissed } from '@/lib/dismissed';
import { initialKids, kidIdsOf } from '@/lib/ride';
import { Avatar, Body, Button, Card, EmptyState, FadeIn, Heading, SkeletonCard, Small } from '@/components/ui';
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
type UpdateItem = { circleId: string; circleName: string; b: Broadcast };
type Trip = { legId: string; start: string; title: string; dir: string; state: 'upcoming' | 'live' | 'done' | 'problem'; text: string };
type KidDay = { key: string; kidId: string; kidColor?: string; circleId: string; date: string; kidName: string; headline: string; trips: Trip[] };
type Report = { items: Item[]; reminders: Reminder[]; swaps: SwapRow[]; updates: UpdateItem[]; arcs: KidDay[] };

const EMPTY: Report = { items: [], reminders: [], swaps: [], updates: [], arcs: [] };
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
      .map((b) => ({ circleId, circleName: circle.name, b }));

    // Each of my children's day: every ride they are on today, in time order, each with its own status.
    // A child can have any number of trips (school, practice, a club), so this is a list, not a fixed path.
    const arcs: KidDay[] = [];
    const live = entries.filter(([legId, leg]) => runsOn(leg, today) && !isSkipped(legId, today, overrides, days));
    for (const kid of kids.filter((k) => !!uid && guardiansOf(k).includes(uid))) {
      const trips = live
        .filter(([, leg]) => leg.stops.some((s) => s.kidIds.includes(kid.id)))
        .map(([legId, leg]): Trip => {
          const run = runs[runKey(legId, today)];
          const mine = run?.kids?.[kid.id];
          const dir = dirLabel(leg.direction);
          let state: Trip['state'] = 'upcoming';
          let text = 'Scheduled';
          if (run?.status === 'started') {
            state = 'live';
            text = mine === 'dropped_off' ? 'Dropped off' : mine === 'picked_up' ? 'In the car' : mine === 'absent' ? "Didn't ride" : dir === 'Pickup' ? 'Pickup in progress' : 'On the way';
            if (mine === 'dropped_off' || mine === 'absent') state = 'done';
          } else if (run?.status === 'completed') {
            if (mine === 'dropped_off') { state = 'done'; text = 'Dropped off'; }
            else if (mine === 'absent') { state = 'done'; text = "Didn't ride"; }
            else { state = 'problem'; text = mine === 'picked_up' ? 'Ride ended, drop-off not confirmed' : 'Ride ended, not confirmed'; }
          }
          return { legId, start: effectiveWindow(legId, leg, today, overrides).start, title: leg.name?.trim() || circle.name, dir, state, text };
        })
        .sort((a, b) => a.start.localeCompare(b.start));
      if (trips.length === 0) continue;
      const liveNow = trips.find((t) => t.state === 'live');
      const next = trips.find((t) => t.state === 'upcoming');
      const problem = trips.find((t) => t.state === 'problem');
      const headline = liveNow
        ? `${liveNow.text} · ${liveNow.title}`
        : next
          ? `Next: ${next.dir.toLowerCase()} at ${fmtTime(next.start)}`
          : problem
            ? problem.text
            : trips.length > 1
              ? 'All done today'
              : trips[0].text;
      arcs.push({ key: `${circleId}_${kid.id}`, kidId: kid.id, kidColor: kid.color, circleId, date: today, kidName: kid.name, headline, trips });
    }

    return { items, reminders, swaps: openSwaps, updates, arcs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle, members, kids, legs, overrides, days, runs, swaps, broadcasts, rotation, uid, today, datesKey]);

  // Report only once the circle's data has arrived, so the screen never claims "nothing today" while it is still loading.
  useEffect(() => {
    if (circle) onReport(circleId, report);
  }, [report, circle, circleId, onReport]);
  return null;
}

// Collects the reports from one probe per circle.
function useReports(circleIds: string[]) {
  const [byCircle, setByCircle] = useState<Record<string, Report>>({});
  const onReport = useMemo(() => (id: string, r: Report) => setByCircle((b) => ({ ...b, [id]: r })), []);
  // A circle that never loads must not hold the screen forever: give up waiting after a few seconds.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5000);
    return () => clearTimeout(t);
  }, []);
  const ready = waited || circleIds.every((id) => !!byCircle[id]);
  const reports = circleIds.map((id) => byCircle[id] ?? EMPTY);
  return { reports, onReport, ready };
}

// ---------- the Today tab ----------
export default function TodayFeed({ circleIds }: { circleIds: string[] }) {
  const { uid, profile } = useSession();
  const today = useMemo(() => [toISO(new Date())], []);
  const { reports, onReport, ready } = useReports(circleIds);
  const { dismissed, dismiss } = useDismissed();

  const items = reports.flatMap((r) => r.items).sort((a, b) => a.start.localeCompare(b.start));
  const reminders = reports.flatMap((r) => r.reminders);
  const arcs = reports.flatMap((r) => r.arcs);
  const swaps = reports.flatMap((r) => r.swaps).sort((a, b) => a.swap.date.localeCompare(b.swap.date));
  // One card per ride: only its most recent status. A single pickup used to produce three messages
  // (picked up, dropped off, finished); what matters is where the ride stands now.
  const newestPerRide = new Map<string, UpdateItem>();
  for (const u of reports.flatMap((r) => r.updates).sort((a, b) => newestFirst(a.b, b.b))) {
    const key = u.circleId + '_' + u.b.legId + '_' + u.b.date;
    if (!newestPerRide.has(key)) newestPerRide.set(key, u);
  }
  const updateKey = (u: UpdateItem) => u.circleId + '_' + u.b.legId + '_' + u.b.date + '_' + u.b.createdAt;
  const updates = [...newestPerRide.values()].filter((u) => !dismissed.has(updateKey(u))).slice(0, 3);
  const myName = profile?.name ?? 'A parent';
  const nothing = items.length + reminders.length + arcs.length + swaps.length + updates.length === 0;

  return (
    <>
      {circleIds.map((id) => (
        <Probe key={id} circleId={id} dates={today} onReport={onReport} />
      ))}

      {!ready && (
        <View style={{ gap: space.sm }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )}

      {ready && nothing && (
        <EmptyState
          icon={<Sun size={24} color={colors.accent} strokeWidth={2} />}
          title="A clear day"
          body="No rides today. Tomorrow and the days after are on the Week tab."
          action={{ label: 'See the week', variant: 'secondary', onPress: () => router.push('/week') }}
        />
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
            <UpdateRow key={`${u.b.createdAt}_${i}`} b={u.b} showRide onPress={() => router.push("/circle/" + u.circleId + "/ride/" + u.b.legId + "?date=" + u.b.date)} onDismiss={() => dismiss(updateKey(u))} />
          ))}
        </View>
      )}

      {arcs.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Heading>Your kids today</Heading>
          {arcs.map((a) => (
            <FadeIn key={a.key}>
            <Card style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar name={a.kidName} size={44} id={a.kidId} colorKey={a.kidColor} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{a.kidName.split(' ')[0]}</Body>
                  <Small>{a.headline}</Small>
                </View>
              </View>
              <View>
                {a.trips.map((t, i) => (
                  <Pressable
                    key={t.legId}
                    accessibilityRole="button"
                    onPress={() => router.push(`/circle/${a.circleId}/ride/${t.legId}?date=${a.date}`)}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: 6, borderTopWidth: i === 0 ? 1 : 0, borderBottomWidth: 1, borderColor: colors.line }, pressed && { opacity: 0.7 }]}
                  >
                    <TripDot state={t.state} />
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontWeight: '600' }}>
                        {fmtTime(t.start)} · {t.title}
                      </Body>
                      <Small style={{ color: t.state === 'live' ? colors.accent : t.state === 'problem' ? colors.danger : colors.inkSoft, fontWeight: t.state === 'live' ? '700' : '500' }}>
                        {t.dir} · {t.text}
                      </Small>
                    </View>
                    <ChevronRight size={18} color={colors.inkSoft} />
                  </Pressable>
                ))}
              </View>
            </Card>
            </FadeIn>
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
                <Small style={{ color: colors.onAccent }}>Today</Small>
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
    <FadeIn>
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
      {it.status === 'started' && <Button label={it.mine ? 'Back to the ride' : 'Watch live'} onPress={open} />}
    </Card>
    </FadeIn>
  );
}

// The marker at the left of a child's trip: a check when done, a filled dot when live, an outline when still to come.
function TripDot({ state }: { state: Trip['state'] }) {
  if (state === 'done')
    return (
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.okSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={16} color={colors.ok} strokeWidth={3} />
      </View>
    );
  const c = state === 'live' ? colors.accent : state === 'problem' ? colors.danger : colors.line;
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: state === 'live' ? c : 'transparent', borderWidth: 2, borderColor: c }} />
    </View>
  );
}

function StatusDot({ status }: { status: Item['status'] }) {
  const m = {
    scheduled: { t: 'Scheduled', bg: colors.sunk, fg: colors.inkSoft },
    started: { t: 'Live', bg: colors.accent, fg: colors.onAccent },
    completed: { t: 'Done', bg: colors.okSoft, fg: colors.ok },
    skipped: { t: 'Skipped', bg: colors.sunk, fg: colors.inkSoft },
  }[status];
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Small style={{ color: m.fg, fontWeight: '700' }}>{m.t}</Small>
    </View>
  );
}
