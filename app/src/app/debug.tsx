import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useMemberships } from '@/lib/useMemberships';
import { useCircle } from '@/lib/useCircle';
import { useSession } from '@/lib/session';
import { guardiansOf, isOrganizer, runKey } from '@/lib/data';
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
  if (!circle) return <Small>Loading circle…</Small>;

  const today = toISO(new Date());
  const nameOfUid = (u?: string | null) => members.find((m) => m.uid === u)?.name ?? short(u);
  const nameOfKid = (k: string) => kids.find((x) => x.id === k)?.name ?? short(k);
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
  L.push('ALL RIDE RECORDS (key = ride + date)');
  const legName = (id: string) => legs[id]?.name ?? short(id);
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
