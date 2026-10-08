import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { Platform, Text, View } from 'react-native';
import { useMemberships } from '@/lib/useMemberships';
import { useCircle } from '@/lib/useCircle';
import { useSession } from '@/lib/session';
import { ensureRealtimeAccess, guardiansOf, isOrganizer, livePath, runKey } from '@/lib/data';
import { rtdb } from '@/lib/firebase';
import { gpsDebug } from '@/lib/gpsDebug';
import type { Live } from '@/lib/ride';
import { isSkipped, overrideKey, runsOn, toISO } from '@/lib/schedule';
import { Body, Button, Card, Heading, Screen, Small, Title } from '@/components/ui';
import { colors, font, space } from '@/theme';

// A plain-text picture of what this phone sees, to paste to whoever is helping. It lists names of rides
// and children but no passwords, tokens or login details; ids are shortened.
export default function Debug() {
  const rows = useMemberships();
  return (
    <Screen back>
      <Title>Diagnostics</Title>
      <Body soft>
        If something looks wrong, tap Copy under a circle and paste the result into your message. It shows the rides, children and ride records this phone is working
        from. It contains names of rides and children but no passwords or login details.
      </Body>
      {rows === null && <Small>Loading…</Small>}
      {rows?.map((r) => <CircleReport key={r.id} circleId={r.id} />)}
    </Screen>
  );
}

const short = (s?: string | null) => (s ? s.slice(0, 6) : '—');

function CircleReport({ circleId }: { circleId: string }) {
  const { uid, profile } = useSession();
  const { circle, members, kids, legs, overrides, days, runs } = useCircle(circleId);
  const [copied, setCopied] = useState(false);

  // Location sharing: what this phone is doing, and what the server holds for any ride in progress.
  const [perm, setPerm] = useState('unknown');
  const [, tick] = useState(0);
  const [live, setLive] = useState<Record<string, Live | { error: string } | null>>({});
  useEffect(() => {
    try {
      (navigator as unknown as { permissions?: { query: (q: { name: string }) => Promise<{ state: string }> } }).permissions
        ?.query({ name: 'geolocation' })
        .then((r) => setPerm(r.state))
        .catch(() => {});
    } catch {
      // Not supported in this browser.
    }
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);
  const startedKeys = Object.entries(runs).filter(([, r]) => r.status === 'started').map(([k]) => k).join(',');
  useEffect(() => {
    if (!circle || !startedKeys) return;
    let alive = true;
    const offs: (() => void)[] = [];
    ensureRealtimeAccess(circleId, circle.inviteCode, false).then(() => {
      if (!alive) return;
      for (const k of startedKeys.split(',')) {
        offs.push(
          onValue(
            ref(rtdb, livePath(circleId, k)),
            (s) => setLive((l) => ({ ...l, [k]: s.val() as Live | null })),
            (err) => setLive((l) => ({ ...l, [k]: { error: err.message } })),
          ),
        );
      }
    });
    return () => {
      alive = false;
      offs.forEach((o) => o());
    };
  }, [circleId, circle?.inviteCode, startedKeys]);

  if (!circle) return <Small>Loading circle…</Small>;

  const today = toISO(new Date());
  const nameOfUid = (u?: string | null) => members.find((m) => m.uid === u)?.name ?? short(u);
  const nameOfKid = (k: string) => kids.find((x) => x.id === k)?.name ?? short(k);
  const legName = (id: string) => legs[id]?.name ?? short(id);
  const L: string[] = [];

  L.push(`Phone date: ${today}  now: ${new Date().toString()}`);
  L.push(`Circle: ${circle.name} (${short(circleId)})  me: ${profile?.name} (${short(uid)})  organizer: ${isOrganizer(circle, uid) ? 'yes' : 'no'}`);
  L.push(`Members: ${members.map((m) => `${m.name} (${short(m.uid)})`).join(', ')}`);
  L.push(`Household on my profile: ${(profile?.household ?? []).map((u) => nameOfUid(u)).join(', ') || 'none'}`);
  L.push('');
  L.push('CHILDREN');
  for (const k of kids) L.push(`- ${k.name} (${short(k.id)}) parents: ${guardiansOf(k).map((u) => nameOfUid(u)).join(', ')}`);
  L.push('');
  L.push('RIDES');
  for (const [id, leg] of Object.entries(legs)) {
    const onToday = runsOn(leg, today);
    L.push(
      `- ${leg.name ?? '(no name)'} ${leg.direction} (${short(id)}) days=${leg.date ?? leg.days.join('')} start=${leg.windowStart} from=${leg.startDate} runsToday=${onToday ? 'yes' : 'no'}${onToday && isSkipped(id, today, overrides, days) ? ' SKIPPED' : ''}`,
    );
    L.push(`    stops: ${leg.stops.map((s) => `${s.label}[${s.kidIds.map(nameOfKid).join('+') || 'no kids'}]`).join(' > ')}`);
    L.push(`    driver: ${leg.driverMode === 'fixed' ? `always ${nameOfUid(leg.fixedUid)}` : 'rotation'}  override today: ${JSON.stringify(overrides[overrideKey(id, today)] ?? null)}`);
    const run = runs[runKey(id, today)];
    L.push(
      `    today's record: ${run ? `${run.status} stop=${run.stopIndex} driver=${nameOfUid(run.driverUid)} kids={${Object.entries(run.kids ?? {}).map(([k, v]) => `${nameOfKid(k)}:${v}`).join(', ')}}` : 'NONE'}`,
    );
  }
  L.push('');
  L.push('LOCATION SHARING');
  const ago = (ms: number) => (ms ? Math.round((Date.now() - ms) / 1000) + 's ago' : 'never');
  L.push(`This phone: browser permission=${perm}  sharing now=${gpsDebug.watching ? 'yes' : 'no'}`);
  L.push(`  location: ${gpsDebug.geo} (last fix ${ago(gpsDebug.lastFixAt)})`);
  L.push(`  last send: ${gpsDebug.publish} (${ago(gpsDebug.lastSentAt)})`);
  const startedList = startedKeys ? startedKeys.split(',') : [];
  if (startedList.length === 0) L.push('Rides in progress: none');
  for (const k of startedList) {
    const [legId] = k.split('_');
    const v = live[k];
    const where = v === undefined ? 'checking…' : v === null ? 'NO position on the server' : 'error' in v ? `ERROR ${v.error}` : `position on the server: ${v.lat.toFixed(4)}, ${v.lng.toFixed(4)} updated ${Math.round((Date.now() - v.ts) / 1000)}s ago (simulated=${v.sim ? 'yes' : 'no'})`;
    L.push(`Ride in progress: ${legName(legId)} ${legs[legId]?.direction ?? ''} driver=${nameOfUid(runs[k]?.driverUid)}  ->  ${where}`);
  }
  L.push('');
  L.push('ALL RIDE RECORDS (key = ride + date)');
  for (const [key, run] of Object.entries(runs).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 14)) {
    const [legId, date] = key.split('_');
    L.push(`- ${legName(legId)} ${legs[legId]?.direction ?? ''} on ${date}: ${run.status} kids={${Object.entries(run.kids ?? {}).map(([k, v]) => `${nameOfKid(k)}:${v}`).join(', ')}}`);
  }
  const text = L.join('\n');

  async function copy() {
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the text below can be selected by hand.
    }
  }

  return (
    <Card style={{ gap: space.sm }}>
      <Heading>{circle.name}</Heading>
      <Button variant="secondary" label={copied ? 'Copied' : 'Copy this report'} onPress={copy} />
      <View style={{ backgroundColor: colors.sunk, borderRadius: 12, padding: space.sm }}>
        <Text selectable style={{ fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, Consolas, monospace' : font.family, fontSize: 11, lineHeight: 16, color: colors.ink }}>
          {text}
        </Text>
      </View>
    </Card>
  );
}
