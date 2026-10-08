import { useState } from 'react';
import { View } from 'react-native';
import { Check, ShieldCheck } from 'lucide-react-native';
import { accountError, addEmailToAccount, emailPasswordReset, useAccountEmail } from '@/lib/account';
import { Body, Button, Card, ErrorNote, Field, Heading, Small } from '@/components/ui';
import { colors, space } from '@/theme';

// Me > account. Without an email and password, losing this phone or clearing its browser means losing
// the account. With them, signing in on any phone brings back every circle, ride and child.
export default function AccountSection() {
  const email = useAccountEmail();
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await addEmailToAccount(address, password);
      setPassword('');
    } catch (e) {
      setError(accountError(e));
    }
    setBusy(false);
  }

  async function reset() {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await emailPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(accountError(e));
    }
    setBusy(false);
  }

  if (email)
    return (
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Check size={20} color={colors.ok} strokeWidth={3} />
          <Heading>Your account is saved</Heading>
        </View>
        <Body>{email}</Body>
        <Small>On a new phone, choose "I already have an account" on the first screen and sign in with this email to get everything back.</Small>
        <ErrorNote message={error} />
        {sent ? <Small style={{ color: colors.ok, fontWeight: '600' }}>Check your email for a link to choose a new password.</Small> : <Button variant="secondary" label="Change my password" onPress={reset} loading={busy} />}
      </Card>
    );

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ShieldCheck size={22} color={colors.accent} strokeWidth={2.25} />
        <Heading>Keep your account safe</Heading>
      </View>
      <Body soft>
        Right now your account lives only in this browser. If you lose this phone or clear its data, your rides and children cannot be recovered. Add an email and a password and you can sign back in from any phone.
      </Body>
      <Field label="Email" value={address} onChangeText={setAddress} autoCapitalize="none" autoComplete="email" keyboardType="email-address" autoCorrect={false} placeholder="you@example.com" />
      <Field label="Choose a password" hint="At least 6 characters." value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" autoCorrect={false} />
      <ErrorNote message={error} />
      <Button label="Save my account" onPress={save} loading={busy} disabled={!address.trim() || password.length < 6} />
    </Card>
  );
}
