import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addKid, deleteKid, Kid, updateKid } from '@/lib/data';
import { useSession } from '@/lib/session';
import { Avatar, Body, Button, Centered, ErrorNote, Field, Gap, Screen, Small, Title } from '@/components/ui';
import { colors } from '@/theme';

export default function KidProfile() {
  const { id, kidId } = useLocalSearchParams<{ id: string; kidId: string }>();
  const isNew = kidId === 'new';
  const { profile } = useSession();
  const [ready, setReady] = useState(isNew);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    getDoc(doc(db, 'circles', id, 'kids', kidId)).then((s) => {
      const k = s.data() as Kid | undefined;
      if (k) {
        setName(k.name);
        setNotes(k.notes);
        setEmergencyName(k.emergencyName);
        setEmergencyPhone(k.emergencyPhone);
      }
      setReady(true);
    });
  }, [id, kidId, isNew]);

  if (!ready)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );

  async function save() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const kid = { name: name.trim(), notes: notes.trim(), emergencyName: emergencyName.trim(), emergencyPhone: emergencyPhone.trim() };
    try {
      if (isNew) await addKid(id, kid, profile);
      else await updateKid(id, kidId, kid);
      router.back();
    } catch {
      setError('Could not save. Try again in a moment.');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteKid(id, kidId);
      router.back();
    } catch {
      setError('Could not remove this profile.');
      setBusy(false);
    }
  }

  return (
    <Screen back footer={<Button label={isNew ? 'Add child' : 'Save changes'} onPress={save} loading={busy} disabled={!name.trim() || !profile} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Avatar name={name || '?'} size={64} />
        <View style={{ flex: 1 }}>
          <Title>{isNew ? 'Add a child' : name || 'Child'}</Title>
          <Small>Initials only. We never store photos of children.</Small>
        </View>
      </View>
      <Gap size="xs" />
      <Field label="Name" value={name} onChangeText={setName} placeholder="Maya" autoCapitalize="words" />
      <Field
        label="Notes for drivers"
        hint="Booster seat, allergies, where they wait for pickup."
        value={notes}
        onChangeText={setNotes}
        placeholder="Booster seat. Waits by the library door."
        multiline
      />
      <Body>Emergency contact</Body>
      <Field label="Contact name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Sam Whitfield" autoCapitalize="words" />
      <Field label="Contact phone" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="555 010 0142" keyboardType="phone-pad" />
      <ErrorNote message={error} />
      {!isNew && <Button variant="danger" label="Remove this profile" onPress={remove} disabled={busy} />}
    </Screen>
  );
}
