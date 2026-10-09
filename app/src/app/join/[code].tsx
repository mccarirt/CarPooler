import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ensureSignedIn, getInvite, joinCircle, requestToJoin, saveProfile } from '@/lib/data';
import { useMyRequest } from '@/lib/useJoinRequests';
import { addPendingJoin, claimJoin, releaseJoin, removePendingJoin } from '@/lib/pendingJoins';
import { useSession } from '@/lib/session';
import { accountError, addEmailToAccount, emailPasswordReset, signInWithEmail, useAccountEmail } from '@/lib/account';
import EmailFields from '@/components/EmailFields';
import { Body, Button, Centered, ErrorNote, Field, Gap, Heading, Screen, Small, Title } from '@/components/ui';
import { colors } from '@/theme';

// An invite link does not open the door by itself: it lets you ASK. The person who started the circle
// approves you, and then you are in. Their approval works once.
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
  const [note, setNote] = useState<string | null>(null);
  const request = useMyRequest(invite?.circleId, uid);
  const finishing = useRef(false);

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

  // Once the organizer approves, finish joining by ourselves.
  useEffect(() => {
    if (request?.status !== 'approved' || !invite || finishing.current || !claimJoin(invite.circleId)) return;
    finishing.current = true;
    (async () => {
      try {
        const id = await joinCircle(code, { name: request.name, car: request.car, ...(request.color ? { color: request.color } : {}), ...(request.icon ? { icon: request.icon } : {}) });
        removePendingJoin(invite.circleId);
        router.replace(`/circle/${id}`);
      } catch {
        finishing.current = false;
        releaseJoin(invite.circleId);
        setError('You were approved, but joining did not finish. Check your connection and open the link again.');
      }
    })();
  }, [request, invite, code]);

  if (loading || invite === undefined || request === undefined)
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

  async function ask() {
    if (!invite) return;
    setBusy(true);
    setError(null);
    try {
      if (!accountEmail) await addEmailToAccount(email, password);
      await saveProfile(name, car);
      addPendingJoin({ circleId: invite.circleId, code, circleName: invite.circleName }); // so joining finishes by itself, even if this page is closed
      await requestToJoin(invite.circleId, code, { name: name.trim(), car: car.trim(), ...(profile?.color ? { color: profile.color } : {}), ...(profile?.icon ? { icon: profile.icon } : {}) });
    } catch (e) {
      removePendingJoin(invite.circleId); // the request did not go through, so there is nothing to wait for
      setError((e as { code?: string })?.code ? accountError(e) : 'Could not send your request. Try again in a moment.');
    }
    setBusy(false);
  }

  async function forgot() {
    setError(null);
    setNote(null);
    if (!email.trim()) return setError('Type your email above first, then tap this again.');
    try {
      await emailPasswordReset(email);
      setNote('Check your email for a link to choose a new password.');
    } catch (e) {
      setError(accountError(e));
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

  if (request?.status === 'pending')
    return (
      <Screen>
        <Heading>Request sent</Heading>
        <Title>Waiting for the organizer</Title>
        <Body soft>
          {invite.circleName} is invite-only, and the person who started it lets people in. You will get in as soon as they approve. Keep this page open, or open the same link again later to finish.
        </Body>
        <Button variant="secondary" label="Back to the app" onPress={() => router.replace('/')} />
      </Screen>
    );

  if (request?.status === 'approved')
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
        <Gap size="sm" />
        <Body soft>You are in. Joining {invite.circleName}…</Body>
        <ErrorNote message={error} />
      </Centered>
    );

  if (request?.status === 'declined')
    return (
      <Screen>
        <Title>Not this time</Title>
        <Body soft>The organizer of {invite.circleName} did not let this request in. If that is a mistake, ask them directly, then ask again.</Body>
        <ErrorNote message={error} />
        <Button label="Ask again" onPress={ask} loading={busy} />
        <Button variant="ghost" label="Back to the app" onPress={() => router.replace('/')} />
      </Screen>
    );

  if (signingIn)
    return (
      <Screen footer={<Button label="Sign in" onPress={signIn} loading={busy} disabled={!email.trim() || !password} />}>
        <Title>Welcome back</Title>
        <Body soft>Sign in with the email you saved in the app. If you are already in {invite.circleName}, you will find it in your circles.</Body>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" autoCorrect={false} placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" autoCorrect={false} />
        <ErrorNote message={error} />
        {note && <Small style={{ color: colors.ok, fontWeight: '600' }}>{note}</Small>}
        <Button variant="ghost" label="Forgot my password" onPress={forgot} />
        <Button variant="ghost" label="I am new here" onPress={() => { setSigningIn(false); setError(null); setNote(null); }} />
      </Screen>
    );

  const needsEmail = !accountEmail;
  return (
    <Screen footer={<Button label={`Ask to join ${invite.circleName}`} onPress={ask} loading={busy} disabled={!name.trim() || !uid || (needsEmail && (!email.trim() || password.length < 6))} />}>
      <Heading>You are invited to</Heading>
      <Title>{invite.circleName}</Title>
      <Body soft>Add your name so the other parents know who you are{needsEmail ? ', and an email so you can always get back in' : ''}. The organizer then lets you in.</Body>
      <Gap size="sm" />
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Dana Whitfield" autoCapitalize="words" autoComplete="name" />
      <Field label="Your car (optional)" hint="Kids spot it faster in the pickup line." value={car} onChangeText={setCar} placeholder="Blue Odyssey" />
      {needsEmail && <EmailFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />}
      <ErrorNote message={error} />
      {needsEmail && <Button variant="ghost" label="I already have an account" onPress={() => { setSigningIn(true); setError(null); }} />}
    </Screen>
  );
}
