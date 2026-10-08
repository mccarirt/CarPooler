import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureSignedIn, getInvite, joinCircle, saveProfile } from '@/lib/data';
import { useSession } from '@/lib/session';
import { Body, Button, Centered, ErrorNote, Field, Gap, Heading, Screen, Title } from '@/components/ui';
import { colors } from '@/theme';

export default function Join() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw ?? '').toUpperCase();
  const { profile, uid, loading } = useSession();
  const [invite, setInvite] = useState<{ circleId: string; circleName: string } | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign in quietly so the invite can be looked up, then skip ahead if already a member.
  useEffect(() => {
    (async () => {
      try {
        const me = await ensureSignedIn();
        const found = await getInvite(code);
        if (found) {
          const member = await getDoc(doc(db, 'circles', found.circleId, 'members', me)).catch(() => null);
          if (member?.exists()) {
            router.replace(`/circle/${found.circleId}`);
            return;
          }
        }
        setInvite(found);
      } catch {
        setInvite(null);
      }
    })();
  }, [code]);

  useEffect(() => {
    if (profile) {
      setName((n) => n || profile.name);
      setCar((c) => c || profile.car);
    }
  }, [profile]);

  if (loading || invite === undefined)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );

  if (invite === null)
    return (
      <Screen back>
        <Title>That link does not work</Title>
        <Body soft>It may have been copied wrong or the circle was changed. Ask whoever invited you to send it again.</Body>
        <Button label="Back to the app" variant="secondary" onPress={() => router.replace('/')} />
      </Screen>
    );

  async function join() {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      await saveProfile(name, car);
      const id = await joinCircle(code, { name: name.trim(), car: car.trim(), ...(profile?.color ? { color: profile.color } : {}) });
      router.replace(`/circle/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button label={`Join ${invite.circleName}`} onPress={join} loading={busy} disabled={!name.trim() || !uid} />}>
      <Heading>You are invited to</Heading>
      <Title>{invite.circleName}</Title>
      <Body soft>Add your name so the other parents know who you are. That is all it takes.</Body>
      <Gap size="sm" />
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Dana Whitfield" autoCapitalize="words" autoComplete="name" />
      <Field label="Your car (optional)" hint="Kids spot it faster in the pickup line." value={car} onChangeText={setCar} placeholder="Blue Odyssey" />
      <ErrorNote message={error} />
    </Screen>
  );
}
