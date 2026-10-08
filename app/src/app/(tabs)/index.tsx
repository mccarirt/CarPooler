import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Plus, Users } from 'lucide-react-native';
import { useMemberships } from '@/lib/useMemberships';
import { useSession } from '@/lib/session';
import { prettyDate, toISO } from '@/lib/schedule';
import TodayFeed from '@/components/TodayFeed';
import { Body, Button, Card, Heading, Screen, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

// Today: what needs me right now.
export default function Today() {
  const { profile } = useSession();
  const rows = useMemberships();

  return (
    <Screen tab>
      <View style={{ height: space.sm }} />
      <Small>Hi, {(profile?.name ?? '').split(' ')[0]}</Small>
      <Title>{prettyDate(toISO(new Date()))}</Title>
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
          <Button label="Start a circle" icon={<Plus size={22} color="#fff" strokeWidth={2.5} />} onPress={() => router.push('/circle/new')} />
        </Card>
      ) : (
        <TodayFeed circleIds={rows.map((r) => r.id)} />
      )}
    </Screen>
  );
}
