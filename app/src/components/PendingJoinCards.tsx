import { View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { router } from 'expo-router';
import { removePendingJoin, usePendingJoins } from '@/lib/pendingJoins';
import { useMyRequest } from '@/lib/useJoinRequests';
import { useSession } from '@/lib/session';
import { Body, Button, Card, Heading, Small } from '@/components/ui';
import { colors, space } from '@/theme';

// For someone who asked to join a circle and is waiting to be let in (or was turned down).
export default function PendingJoinCards() {
  const list = usePendingJoins();
  return (
    <>
      {list.map((p) => (
        <One key={p.circleId} circleId={p.circleId} circleName={p.circleName} code={p.code} />
      ))}
    </>
  );
}

function One({ circleId, circleName, code }: { circleId: string; circleName: string; code: string }) {
  const { uid } = useSession();
  const req = useMyRequest(circleId, uid);
  if (req === undefined) return null;
  if (req === null) return null; // the request is gone (joined, or withdrawn)
  return (
    <Card style={{ gap: space.sm, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Clock size={20} color={colors.accent} strokeWidth={2.25} />
        <Heading>{req.status === 'declined' ? 'Not approved' : 'Waiting to join ' + circleName}</Heading>
      </View>
      <Body>
        {req.status === 'declined'
          ? 'The organizer did not let this request in. If that is a mistake, ask them directly, then ask again.'
          : 'An organizer has to let you in. You will be taken into the circle as soon as they do, wherever you are in the app.'}
      </Body>
      {req.status === 'declined' && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Ask again" onPress={() => router.push('/join/' + code)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" label="Dismiss" onPress={() => removePendingJoin(circleId)} />
          </View>
        </View>
      )}
      {req.status === 'pending' && <Small>Only the person who started the circle, or a co-organizer, can approve you.</Small>}
    </Card>
  );
}
