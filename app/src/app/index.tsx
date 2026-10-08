import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { ChevronRight, Plus, Users } from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { Membership, saveProfile } from '@/lib/data';
import { useSession } from '@/lib/session';
import { Body, Button, Card, Centered, Display, ErrorNote, Field, Gap, Heading, Screen, Small, Title } from '@/components/ui';
import TodayFeed from '@/components/TodayFeed';
import { colors, space } from '@/theme';

export default function Home() {
  const { loading, profile } = useSession();
  if (loading)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  return profile ? <Circles name={profile.name} /> : <Welcome />;
}

function Welcome() {
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile(name, car);
    } catch {
      setError('Could not get you set up. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={<Button label="Continue" onPress={go} loading={busy} disabled={!name.trim()} />}
    >
      <Gap size="xl" />
      <Display>Share the drive. Skip the group-text scramble.</Display>
      <Body soft>
        Carpool Circle keeps your school and practice runs organized: who drives, when, and that every kid got where
        they were going.
      </Body>
      <Gap size="sm" />
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Dana Whitfield" autoCapitalize="words" autoComplete="name" />
      <Field
        label="Your car (optional)"
        hint="Kids spot it faster in the pickup line."
        value={car}
        onChangeText={setCar}
        placeholder="Blue Odyssey"
      />
      <ErrorNote message={error} />
    </Screen>
  );
}

type Row = Membership & { id: string };

function Circles({ name }: { name: string }) {
  const { uid } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users', uid, 'memberships'), (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Membership) }))),
    );
  }, [uid]);

  return (
    <Screen footer={<Button label="Start a circle" icon={<Plus size={22} color="#fff" strokeWidth={2.5} />} onPress={() => router.push('/circle/new')} />}>
      <Gap size="md" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Small>Hi, {name.split(' ')[0]}</Small>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={{ minHeight: 44, justifyContent: 'center' }} hitSlop={8}>
          <Small style={{ color: colors.accent, fontWeight: '700' }}>Edit your name or car</Small>
        </Pressable>
      </View>
      {rows && rows.length > 0 && <TodayFeed circleIds={rows.map((r) => r.id)} />}
      <Title>Your circles</Title>
      {rows === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : rows.length === 0 ? (
        <Card style={{ alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} color={colors.accent} strokeWidth={2} />
          </View>
          <Heading>No circles yet</Heading>
          <Body soft>
            Start one for your school or team, then send the invite link to the other families. If someone already sent
            you a link, open it and you will land in their circle.
          </Body>
        </Card>
      ) : (
        rows.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/circle/${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Heading>{r.circleName}</Heading>
              <Small>{r.role === 'admin' ? 'You started this circle' : 'Member'}</Small>
            </View>
            <ChevronRight size={22} color={colors.inkSoft} />
          </Card>
        ))
      )}
    </Screen>
  );
}
