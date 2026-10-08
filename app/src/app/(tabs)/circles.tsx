import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Plus, Users } from 'lucide-react-native';
import { useMemberships } from '@/lib/useMemberships';
import { Body, Button, Card, Heading, Screen, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

// Circles: who I am driving with.
export default function Circles() {
  const rows = useMemberships();

  return (
    <Screen tab footer={<Button label="Start a circle" icon={<Plus size={22} color="#fff" strokeWidth={2.5} />} onPress={() => router.push('/circle/new')} />}>
      <View style={{ height: space.sm }} />
      <Title>Your circles</Title>
      {rows === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : rows.length === 0 ? (
        <Card style={{ alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} color={colors.accent} strokeWidth={2} />
          </View>
          <Heading>No circles yet</Heading>
          <Body soft>
            Start one for your school or team, then send the invite link to the other families. If someone already sent you a link, open it
            and you will land in their circle.
          </Body>
        </Card>
      ) : (
        rows.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/circle/${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Heading>{r.circleName}</Heading>
              <Small>{r.role === 'admin' ? 'You started this circle' : 'Member'}</Small>
            </View>
            <ChevronRight size={22} color={colors.inkSoft} />
          </Card>
        ))
      )}
    </Screen>
  );
}
