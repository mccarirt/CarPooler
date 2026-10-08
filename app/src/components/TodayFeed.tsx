import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Bell, ChevronRight } from 'lucide-react-native';
import { useCircle } from '@/lib/useCircle';
import { useSession } from '@/lib/session';
import { addDays, driverFor, effectiveWindow, fmtTime, isSkipped, prettyDate, runsOn, toISO } from '@/lib/schedule';
import { acceptSwap, cancelSwap, guardiansOf, runKey, sendBroadcast } from '@/lib/data';
import { Broadcast, Swap } from '@/lib/social';
import { SwapCard, UpdateRow } from '@/components/social';
import { Avatar, Body, Card, Heading, Small } from '@/components/ui';
import { colors, radius, space } from '@/theme';

type Item = {
  key: string;
  circleId: string;
  legId: string;
  date: string;
  title: string;
  start: string;
  driver: string;
  mine: boolean;
  status: 'scheduled' | 'started' | 'completed' | 'skipped';
};
type Reminder = { key: string; circleId: string; legId: string; date: string; title: string; start: string };
type SwapRow = { circleId: string; key: string; swap: Swap };
type UpdateItem = { circleName: string; b: Broadcast };
type KidArc = { key: string; circleId: string; legId: string; date: string; kidName: string; step: number; label: string };
type Report = { items: Item[]; reminders: Reminder[]; swaps: SwapRow[]; updates: UpdateItem[]; arcs: KidArc[] };

const EMPTY: Report = { items: [], reminders: [], swaps: [], updates: [], arcs: [] };
const ARC = ['Dropoff complete', 'At school', 'Pickup started', 'Home'];
const RECENT_MS = 12 * 60 * 60 * 1000;

// One invisible probe per circle reports what matters upward, so the home screen can merge
// everything into a single list across every circle.
function Probe({ circleId, onReport }: { circleId: string; onReport: (id: string, r: Report) => void }) {
  const { uid } = useSession();
  const { circle, kids, legs, overrides, days, runs, swaps, broadcasts, rotation, nameOf } = useCircle(circleId);
  const date = toISO(new Date());
  const tomorrow = addDays(date, 1);

  const report = useMemo((): Report => {
    if (!circle) return EMPTY;
    const label = (dir: 'AM' | 'PM') => `${circle.name} — ${dir === 'AM' ? 'AM dropoff' : 'PM pickup'}`;
    const entries = Object.entries(legs);

    const items = entries
      .filter(([, leg]) => runsOn(leg, date))
      .map(([legId, leg]): Item => {
        const run = runs[runKey(legId, date)];
        const skipped = isSkipped(legId, date, overrides, days);
        const driver = run?.driverUid ?? driverFor(legId, leg, date, rotation, overrides, days);
        return {
          key: `${circleId}_${legId}`,
          circleId,
          legId,
          date,
          title: label(leg.direction),
          start: effectiveWindow(legId, leg, date, overrides).start,
          driver: driver ? nameOf(driver) : 'No driver yet',
          mine: driver === uid,
          status: skipped ? 'skipped' : run?.status ?? 'scheduled',
        };
      });

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
              title: label(leg.direction),
              start: effectiveWindow(legId, leg, tomorrow, overrides).start,
            }))
        : [];

    const openSwaps = Object.entries(swaps)
      .filter(([, s]) => s.status === 'open' && s.date >= date)
      .map(([key, swap]) => ({ circleId, key, swap }));

    const now = Date.now();
    const updates = broadcasts
      .filter((b) => now - b.createdAt < RECENT_MS && b.fromUid !== uid && b.type !== 'swap_requested')
      .map((b) => ({ circleName: circle.name, b }));

    // The day-long custody arc for each of my children (Uber ends at dropoff; a parent's day doesn't).
    const arcs: KidArc[] = [];
    const live = entries.filter(([legId, leg]) => runsOn(leg, date) && !isSkipped(legId, date, overrides, days));
    for (const kid of kids.filter((k) => !!uid && guardiansOf(k).includes(uid))) {
      const has = (dir: 'AM' | 'PM') => live.find(([, leg]) => leg.direction === dir && leg.stops.some((s) => s.kidIds.includes(kid.id)));
      const am = has('AM');
      const pm = has('PM');
      if (!am && !pm) continue;
      const amRun = am ? runs[runKey(am[0], date)] : undefined;
      const pmRun = pm ? runs[runKey(pm[0], date)] : undefined;
      const amDone = amRun?.kids?.[kid.id] === 'dropped_off';
      const pmHome = pmRun?.kids?.[kid.id] === 'dropped_off';
      const first = (am ?? pm)!;
      let step = -1;
      let label = am ? `Morning ride at ${fmtTime(effectiveWindow(am[0], am[1], date, overrides).start)}` : `Pickup at ${fmtTime(effectiveWindow(pm![0], pm![1], date, overrides).start)}`;
      let target = first;
      if (pmHome) { step = 3; label = 'Home safe'; target = pm!; }
      else if (pmRun?.status === 'started') { step = 2; label = 'On the way home'; target = pm!; }
      else if (amDone) { step = Date.now() - (amRun?.completedAt ?? 0) < 10 * 60 * 1000 ? 0 : 1; label = step === 0 ? 'Dropped off at school' : 'At school'; target = pm ?? am!; }
      else if (amRun?.status === 'started') { label = 'On the way to school'; }
      arcs.push({ key: `${circleId}_${kid.id}`, circleId, legId: target[0], date, kidName: kid.name, step, label });
    }

    return { items, reminders, swaps: openSwaps, updates, arcs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle, kids, legs, overrides, days, runs, swaps, broadcasts, rotation, uid, date]);

  useEffect(() => onReport(circleId, report), [report, circleId, onReport]);
  return null;
}

export default function TodayFeed({ circleIds }: { circleIds: string[] }) {
  const { uid, profile } = useSession();
  const [byCircle, setByCircle] = useState<Record<string, Report>>({});
  const onReport = useMemo(() => (id: string, r: Report) => setByCircle((b) => ({ ...b, [id]: r })), []);
  const reports = circleIds.map((id) => byCircle[id] ?? EMPTY);

  const items = reports.flatMap((r) => r.items).sort((a, b) => a.start.localeCompare(b.start));
  const reminders = reports.flatMap((r) => r.reminders);
  const arcs = reports.flatMap((r) => r.arcs);
  const swaps = reports.flatMap((r) => r.swaps).sort((a, b) => a.swap.date.localeCompare(b.swap.date));
  const updates = reports
    .flatMap((r) => r.updates)
    .sort((a, b) => b.b.createdAt - a.b.createdAt)
    .slice(0, 4);
  const myName = profile?.name ?? 'A parent';

  return (
    <>
      {circleIds.map((id) => (
        <Probe key={id} circleId={id} onReport={onReport} />
      ))}

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
                <Avatar name={a.kidName} size={44} />
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{a.kidName.split(' ')[0]}</Body>
                  <Small>{a.label}</Small>
                </View>
                <ChevronRight size={20} color={colors.inkSoft} />
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {ARC.map((s, i) => (
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
          <Heading>Today</Heading>
          {items.map((it) => (
            <Card
              key={it.key}
              onPress={it.status === 'skipped' ? undefined : () => router.push(`/circle/${it.circleId}/ride/${it.legId}?date=${it.date}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: it.status === 'skipped' ? 0.5 : 1 }}
            >
              <View style={{ width: 72 }}>
                <Heading>{fmtTime(it.start).replace(' ', ' ')}</Heading>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: '600' }}>{it.title}</Body>
                <Small>{it.mine ? 'You are driving' : `${it.driver} is driving`}</Small>
              </View>
              <StatusDot status={it.status} />
              {it.status !== 'skipped' && <ChevronRight size={20} color={colors.inkSoft} />}
            </Card>
          ))}
        </View>
      )}
    </>
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
