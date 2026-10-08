import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Car, Check, Link2, Plus } from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { Circle, Kid, Member, PUBLIC_URL } from '@/lib/data';
import { useSession } from '@/lib/session';
import { Avatar, Body, Button, Card, Centered, Gap, Heading, Screen, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

export default function CircleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { uid } = useSession();
  const [circle, setCircle] = useState<Circle | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [kids, setKids] = useState<(Kid & { id: string })[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db, 'circles', id), (s) => setCircle(s.exists() ? (s.data() as Circle) : null), () => setCircle(null)),
      onSnapshot(collection(db, 'circles', id, 'members'), (s) => setMembers(s.docs.map((d) => d.data() as Member)), () => {}),
      onSnapshot(
        collection(db, 'circles', id, 'kids'),
        (s) => setKids(s.docs.map((d) => ({ id: d.id, ...(d.data() as Kid) }))),
        () => {},
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [id]);

  if (circle === undefined)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  if (circle === null)
    return (
      <Screen back>
        <Title>Circle not found</Title>
        <Body soft>Either it does not exist or you are not a member. Open the invite link you were sent to join.</Body>
      </Screen>
    );

  const link = `${Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : PUBLIC_URL}/join/${circle.inviteCode}`;

  async function shareLink() {
    const message = `Join our carpool circle "${circle!.name}": ${link}`;
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
        if (nav.share) await nav.share({ text: message });
        else {
          await navigator.clipboard.writeText(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }
      } else {
        await Share.share({ message });
      }
    } catch {
      // Share sheet dismissed; nothing to do.
    }
  }

  const byOwner = (owner: string) => kids.filter((k) => k.ownerUid === owner);

  return (
    <Screen back>
      <Title>{circle.name}</Title>

      <Card style={{ gap: space.sm }}>
        <Heading>Invite families</Heading>
        <Body soft>Anyone with this link can join. Only share it with parents you know.</Body>
        <Button
          variant="secondary"
          label={copied ? 'Link copied' : 'Send invite link'}
          icon={copied ? <Check size={20} color={colors.ok} strokeWidth={2.5} /> : <Link2 size={20} color={colors.ink} strokeWidth={2.25} />}
          onPress={shareLink}
        />
      </Card>

      <Gap size="xs" />
      <Heading>Families</Heading>
      {members.map((m) => (
        <Card key={m.uid} style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={m.name} tone="sun" />
            <View style={{ flex: 1 }}>
              <Heading>
                {m.name}
                {m.uid === uid ? ' (you)' : ''}
              </Heading>
              {m.car ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Car size={14} color={colors.inkSoft} />
                  <Small>{m.car}</Small>
                </View>
              ) : null}
            </View>
            {m.role === 'admin' && <Small>Organizer</Small>}
          </View>
          {byOwner(m.uid).map((k) => (
            <Card
              key={k.id}
              onPress={m.uid === uid ? () => router.push(`/circle/${id}/kid/${k.id}`) : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bg, padding: space.sm }}
            >
              <Avatar name={k.name} size={40} />
              <View style={{ flex: 1 }}>
                <Body>{k.name}</Body>
                {k.notes ? <Small>{k.notes}</Small> : null}
              </View>
            </Card>
          ))}
          {m.uid === uid && (
            <Button
              variant="ghost"
              label="Add a child"
              icon={<Plus size={20} color={colors.ink} strokeWidth={2.5} />}
              onPress={() => router.push(`/circle/${id}/kid/new`)}
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}
