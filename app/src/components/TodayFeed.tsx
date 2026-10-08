import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCircle } from '@/lib/useCircle';
import { useSession } from '@/lib/session';
import { driverFor, effectiveWindow, fmtTime, isSkipped, runsOn, toISO } from '@/lib/schedule';
import { runKey } from '@/lib/data';
import { Body, Card, Heading, Small } from '@/components/ui';
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

// One invisible probe per circle reports today's rides upward so the home screen can
// merge them into a single chronological list across every circle.
function Probe({ circleId, onItems }: { circleId: string; onItems: (id: string, items: Item[]) => void }) {
  const { uid } = useSession();
  const { circle, legs, overrides, days, runs, rotation, nameOf } = useCircle(circleId);
  const date = toISO(new Date());

  const items = useMemo(() => {
    if (!circle) return [];
    return Object.entries(legs)
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
          title: `${circle.name} — ${leg.direction === 'AM' ? 'AM dropoff' : 'PM pickup'}`,
          start: effectiveWindow(legId, leg, date, overrides).start,
          driver: driver ? nameOf(driver) : 'No driver yet',
          mine: driver === uid,
          status: skipped ? 'skipped' : run?.status ?? 'scheduled',
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circle, legs, overrides, days, runs, rotation, uid, date]);

  useEffect(() => onItems(circleId, items), [items, circleId, onItems]);
  return null;
}

export default function TodayFeed({ circleIds }: { circleIds: string[] }) {
  const [byCircle, setByCircle] = useState<Record<string, Item[]>>({});
  const onItems = useMemo(() => (id: string, items: Item[]) => setByCircle((b) => ({ ...b, [id]: items })), []);
  const all = circleIds.flatMap((id) => byCircle[id] ?? []).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <>
      {circleIds.map((id) => (
        <Probe key={id} circleId={id} onItems={onItems} />
      ))}
      {all.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Heading>Today</Heading>
          {all.map((it) => (
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
