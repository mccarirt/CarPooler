import { useState } from 'react';
import { router } from 'expo-router';
import { createCircle } from '@/lib/data';
import { useSession } from '@/lib/session';
import { accountError, addEmailToAccount, useAccountEmail } from '@/lib/account';
import EmailFields from '@/components/EmailFields';
import { Body, Button, ErrorNote, Field, Gap, Screen, Title } from '@/components/ui';

export default function NewCircle() {
  const { profile } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountEmail = useAccountEmail();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function create() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      if (!accountEmail) await addEmailToAccount(email, password);
      const id = await createCircle(name, profile);
      router.replace(`/circle/${id}`);
    } catch (e) {
      setError((e as { code?: string })?.code ? accountError(e) : 'Could not create the circle. Try again in a moment.');
      setBusy(false);
    }
  }

  return (
    <Screen back footer={<Button label="Create circle" onPress={create} loading={busy} disabled={!name.trim() || !profile || (!accountEmail && (!email.trim() || password.length < 6))} />}>
      <Title>Name your circle</Title>
      <Body soft>One circle per carpool group. You can be in as many as you need, and each keeps its own schedule.</Body>
      <Gap size="sm" />
      <Field label="Circle name" value={name} onChangeText={setName} placeholder="Lincoln Elementary" autoCapitalize="words" maxLength={40} />
      {!accountEmail && (
        <>
          <Body soft>Starting a circle needs an email on your account, so you can always get back to it.</Body>
          <EmailFields email={email} password={password} setEmail={setEmail} setPassword={setPassword} />
        </>
      )}
      <ErrorNote message={error} />
    </Screen>
  );
}
