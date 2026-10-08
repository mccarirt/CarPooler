import { View } from 'react-native';
import { router } from 'expo-router';
import { Car, ChevronRight, Pencil } from 'lucide-react-native';
import { useCircleName } from '@/lib/useCircleName';
import { useMemberships } from '@/lib/useMemberships';
import { useSession } from '@/lib/session';
import { useCircle } from '@/lib/useCircle';
import { guardiansOf } from '@/lib/data';
import { Avatar, Body, Button, Card, Heading, Screen, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

// Me: who I am, and the children I am a parent of.
export default function Me() {
  const { profile, uid } = useSession();
  const rows = useMemberships();

  return (
    <Screen tab>
      <View style={{ height: space.sm }} />
      <Title>Me</Title>
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={profile?.name ?? '?'} size={56} id={uid ?? undefined} colorKey={profile?.color} />
          <View style={{ flex: 1, gap: 2 }}>
            <Heading>{profile?.name}</Heading>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Car size={14} color={colors.inkSoft} />
              <Small>{profile?.car || 'No car added yet'}</Small>
            </View>
          </View>
        </View>
        <Button variant="secondary" label="Edit name or car" icon={<Pencil size={20} color={colors.ink} strokeWidth={2.25} />} onPress={() => router.push('/profile')} />
      </Card>

      <Heading>Your children</Heading>
      {rows && rows.length > 0 ? (
        rows.map((r) => <ChildrenIn key={r.id} circleId={r.id} circleName={r.circleName} uid={uid} />)
      ) : (
        <Body soft>Children you add to a circle show up here.</Body>
      )}

      <Card style={{ gap: space.xs, backgroundColor: colors.sunk, borderColor: colors.sunk }}>
        <Body style={{ fontWeight: '600' }}>Signed in on this device</Body>
        <Small>
          You joined with a link and a name, so this phone remembers you. If you clear this browser's data or switch devices, open an invite link
          again to get back into your circles.
        </Small>
      </Card>
    </Screen>
  );
}

function ChildrenIn({ circleId, circleName, uid }: { circleId: string; circleName: string; uid: string | null }) {
  const { kids } = useCircle(circleId);
  const liveName = useCircleName(circleId, circleName);
  const mine = kids.filter((k) => !!uid && guardiansOf(k).includes(uid));
  if (mine.length === 0) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Small>{liveName}</Small>
      {mine.map((k) => (
        <Card key={k.id} onPress={() => router.push(`/circle/${circleId}/kid/${k.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={k.name} size={44} id={k.id} colorKey={k.color} />
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>{k.name}</Body>
            {k.notes ? <Small>{k.notes}</Small> : null}
          </View>
          <ChevronRight size={20} color={colors.inkSoft} />
        </Card>
      ))}
    </View>
  );
}
