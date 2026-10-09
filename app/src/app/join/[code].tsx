import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureSignedIn, getInvite, joinCircle, saveProfile } from '@/lib/data';
import { useSession } from '@/lib/session';
import { accountError, addEmailToAccount, signInWithEmail, useAccountEmail } from '@/lib/account';
import EmailFields from '@/components/EmailFields';
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
  const accountEmail = useAccountEmail();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);

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
      if (!accountEmail) await addEmailToAccount(email, password);
      await saveProfile(name, car);
      const id = await joinCircle(code, { name: name.trim(), car: car.trim(), ...(profile?.color ? { color: profile.color } : {}) });
      router.replace(`/circle/${id}`);
    } catch (e) {
      setError((e as { code?: string })?.code ? accountError(e) : e instanceof Error ? e.message : 'Could not join. Try again.');
      setBusy(false);
    }
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      router.replace('/'); // your circles are already yours; this lands you on Today
    } catch (e) {
      setError(accountError(e));
      setBusy(false);
    }
  }

  if (signingIn)
    return (
      <Screen footer={<Button label="Sign in" onPress={signIn} loading={busy} disabled={!email.trim() || !password} />}>
        <Title>Welcome back</Title>
        <Body soft>Sign in with the email you saved in the app. If you are already in {invite.circleName}, you will find it in your circles.</Body>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" autoCorrect={false} placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" autoCorrect={false} />
        <ErrorNote message={error} />
        <Button variant="ghost" label="I am new here" onPress={() => { setSigningIn(false); setError(null); }} />
      </Screen>
    );

  const needsEmail = !accountEmail;
  return (
    <Screen footer={<Button label={`Join ${invite.circleName}`} onPress={join} loading={busy} disabled={!name.trim() || !uid || (needsEmail && (!email.trim() || password.length < 6))} />}>
      <Heading>You are invited to</Heading>
      <Title>{invite.circleName}</Title>
      <Body soft>Add your name so the other parents know who you are{needsEmail ? ', and an email so you can always get back in' : ''}.</Body>
      <Gap size="sm" />
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Dana Whitfield" autoCapitalize="words" autoComplete="name" />
      <Field label="Your car (optional)" hint="Kids spot it faster in the pickup line." value={car} onChangeText={setCar} placeholder="Blue Odyssey" />
      {needsEmail && <EmailFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />}
      <ErrorNote message={error} />
      {needsEmail && <Button variant="ghost" label="I already have an account" onPress={() => { setSigningIn(true); setError(null); }} />}
    </Screen>
  );
}
