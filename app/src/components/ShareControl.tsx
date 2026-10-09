import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MapPin, Radio } from 'lucide-react-native';
import { startShare, stopShare } from '@/lib/data';
import { minutesLeft, useShares } from '@/lib/useShares';
import { gpsDebug } from '@/lib/gpsDebug';
import { useSession } from '@/lib/session';
import { Avatar, Body, Button, Card, Chip, ErrorNote, Field, FadeIn, Heading, Small, Wrap } from '@/components/ui';
import { colors, space } from '@/theme';

// "Share my location": opt in, for one circle, for a set time. Nothing is shared until you start it, it stops by
// itself, and you can stop it any time.
export default function ShareControl({ circles }: { circles: { id: string; name: string }[] }) {
  const { profile } = useSession();
  const [open, setOpen] = useState(false);
  const [circleId, setCircleId] = useState(circles[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (circles.length === 0 || !profile) return null;
  const chosen = circles.find((c) => c.id === circleId) ?? circles[0];

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await startShare(chosen.id, profile!, note, minutes);
      setOpen(false);
      setNote('');
    } catch {
      setError('Could not start sharing. Check your connection and try again.');
    }
    setBusy(false);
  }

  if (!open) return <Button variant="secondary" label="Share my location" icon={<MapPin size={20} color={colors.ink} strokeWidth={2.25} />} onPress={() => setOpen(true)} />;

  return (
    <FadeIn>
      <Card style={{ gap: space.md }}>
        <Heading>Share my location</Heading>
        <Small>Only the circle you pick can see it, only until the time is up, and you can stop any time. Your phone will ask permission to use its location.</Small>
        {circles.length > 1 && (
          <Wrap>
            {circles.map((c) => (
              <Chip key={c.id} label={c.name} on={c.id === chosen.id} onPress={() => setCircleId(c.id)} />
            ))}
          </Wrap>
        )}
        <Field label="What for? (optional)" value={note} onChangeText={setNote} placeholder="Picking up Rory from tennis" maxLength={80} />
        <Wrap>
          {[30, 60, 120].map((m) => (
            <Chip key={m} label={m === 60 ? '1 hour' : m === 120 ? '2 hours' : m + ' min'} on={minutes === m} onPress={() => setMinutes(m)} />
          ))}
        </Wrap>
        <ErrorNote message={error} />
        <Button label={`Start sharing with ${chosen.name}`} onPress={go} loading={busy} />
        <Button variant="ghost" label="Never mind" onPress={() => setOpen(false)} disabled={busy} />
      </Card>
    </FadeIn>
  );
}

// For one circle: your own share (with a Stop button) and the cards for other people who are sharing.
export function CircleShares({ circleId, circleName }: { circleId: string; circleName: string }) {
  const { uid } = useSession();
  const shares = useShares(circleId);
  const [busy, setBusy] = useState(false);
  const mine = shares.find((s) => s.uid === uid);
  const others = shares.filter((s) => s.uid !== uid);
  const blocked = gpsDebug.geo.startsWith('location blocked') || gpsDebug.geo.startsWith('this browser');

  return (
    <>
      {mine && (
        <FadeIn>
          <Card style={{ gap: space.sm, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Radio size={20} color={colors.accent} strokeWidth={2.25} />
              <Heading>{`You're sharing with ${circleName}`}</Heading>
            </View>
            <Body>{minutesLeft(mine) + ' min left' + (mine.note ? ' · ' + mine.note : '')}</Body>
            {blocked && <Small style={{ color: colors.warnFg, fontWeight: '600' }}>Your phone is not sharing its location, so nobody can see you. Allow location for this site in your browser settings.</Small>}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="secondary"
                  label="See what they see"
                  onPress={() => router.push('/circle/' + circleId + '/share/' + mine.uid)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Stop"
                  loading={busy}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      await stopShare(circleId);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            </View>
          </Card>
        </FadeIn>
      )}
      {others.map((s) => (
        <FadeIn key={s.uid}>
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar name={s.name} size={44} id={s.uid} colorKey={s.color} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '700' }}>{s.name.split(' ')[0] + ' is sharing their location'}</Body>
                <Small>{(s.note ? s.note + ' · ' : '') + minutesLeft(s) + ' min left'}</Small>
              </View>
            </View>
            <Button label="Watch live" onPress={() => router.push('/circle/' + circleId + '/share/' + s.uid)} />
          </Card>
        </FadeIn>
      ))}
    </>
  );
}
