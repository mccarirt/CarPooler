import { View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Plus, Users } from 'lucide-react-native';
import { useCircleName } from '@/lib/useCircleName';
import { useMemberships } from '@/lib/useMemberships';
import { Button, Card, EmptyState, Heading, Screen, SkeletonCard, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

// Circles: who I am driving with.
export default function Circles() {
  const rows = useMemberships();

  return (
    <Screen tab footer={<Button label="Start a circle" icon={<Plus size={22} color="#fff" strokeWidth={2.5} />} onPress={() => router.push('/circle/new')} />}>
      <View style={{ height: space.sm }} />
      <Title>Your circles</Title>
      {rows === null ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users size={24} color={colors.accent} strokeWidth={2} />}
          title="No circles yet"
          body="Start one for your school or team, then send the invite link to the other families. If someone already sent you a link, open it and you will land in their circle."
        />
      ) : (
        rows.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/circle/${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <CircleTitle id={r.id} fallback={r.circleName} />
              <Small>{r.role === 'admin' ? 'You started this circle' : 'Member'}</Small>
            </View>
            <ChevronRight size={22} color={colors.inkSoft} />
          </Card>
        ))
      )}
    </Screen>
  );
}

function CircleTitle({ id, fallback }: { id: string; fallback: string }) {
  return <Heading>{useCircleName(id, fallback)}</Heading>;
}
