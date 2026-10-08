import { useState } from 'react';
import { saveProfile } from '@/lib/data';
import { accountError, emailPasswordReset, signInWithEmail } from '@/lib/account';
import { Body, Button, Display, ErrorNote, Field, Gap, Screen, Small, Title } from '@/components/ui';
import { colors } from '@/theme';

// First screen for someone with no profile yet. No tab bar here: there is nothing to navigate to.
// Two ways in: set up as someone new, or sign in with the email you saved on another phone.
export default function Welcome() {
  const [mode, setMode] = useState<'new' | 'signin'>('new');
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  async function signIn() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await signInWithEmail(email, password); // the app picks up the signed-in person by itself
    } catch (e) {
      setError(accountError(e));
      setBusy(false);
    }
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

  if (mode === 'signin')
    return (
      <Screen footer={<Button label="Sign in" onPress={signIn} loading={busy} disabled={!email.trim() || !password} />}>
        <Gap size="xl" />
        <Title>Welcome back</Title>
        <Body soft>Sign in with the email you saved in the app. Your circles, rides and children come right back.</Body>
        <Gap size="sm" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" autoCorrect={false} placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" autoCorrect={false} />
        <ErrorNote message={error} />
        {note && <Small style={{ color: colors.ok, fontWeight: '600' }}>{note}</Small>}
        <Button variant="ghost" label="Forgot my password" onPress={forgot} />
        <Button variant="ghost" label="I am new here" onPress={() => { setMode('new'); setError(null); setNote(null); }} />
      </Screen>
    );

  return (
    <Screen footer={<Button label="Continue" onPress={go} loading={busy} disabled={!name.trim()} />}>
      <Gap size="xl" />
      <Display>Share the drive. Skip the group-text scramble.</Display>
      <Body soft>
        Carpool Circle keeps your school and practice runs organized: who drives, when, and that every kid got where
        they were going.
      </Body>
      <Gap size="sm" />
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Dana Whitfield" autoCapitalize="words" autoComplete="name" />
      <Field label="Your car (optional)" hint="Kids spot it faster in the pickup line." value={car} onChangeText={setCar} placeholder="Blue Odyssey" />
      <ErrorNote message={error} />
      <Button variant="ghost" label="I already have an account" onPress={() => { setMode('signin'); setError(null); }} />
    </Screen>
  );
}
