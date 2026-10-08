import { View } from 'react-native';
import { router } from 'expo-router';
import { Plus, Users } from 'lucide-react-native';
import { useMemberships } from '@/lib/useMemberships';
import { useSession } from '@/lib/session';
import { useAccountEmail } from '@/lib/account';
import { useNudgeDismissed } from '@/lib/dismissed';
import { prettyDate, toISO } from '@/lib/schedule';
import TodayFeed from '@/components/TodayFeed';
import { Body, Button, Card, EmptyState, Heading, Screen, SkeletonCard, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

// Today: what needs me right now.
export default function Today() {
  const { profile } = useSession();
  const rows = useMemberships();
  const email = useAccountEmail();
  const { hidden, hide } = useNudgeDismissed();

  return (
    <Screen tab>
      <View style={{ height: space.sm }} />
      <Small>Hi, {(profile?.name ?? '').split(' ')[0]}</Small>
      <Title>{prettyDate(toISO(new Date()))}</Title>
      {!email && profile && !hidden && (
        <Card style={{ gap: space.sm, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
          <Heading>Save your account</Heading>
          <Body>Add an email so a lost phone does not mean a lost account.</Body>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Add email" onPress={() => router.push('/me')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" label="Not now" onPress={hide} />
            </View>
          </View>
        </Card>
      )}
      {rows === null ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users size={24} color="#D44D00" strokeWidth={2} />}
          title="Start your first circle"
          body="A circle is the group of families you share rides with. Make one, then send the link to the other parents. If someone already sent you a link, open it and you will land in their circle."
          action={{ label: 'Start a circle', icon: <Plus size={22} color="#fff" strokeWidth={2.5} />, onPress: () => router.push('/circle/new') }}
        />
      ) : (
        <TodayFeed circleIds={rows.map((r) => r.id)} />
      )}
    </Screen>
  );
}
