import { useState } from 'react';
import { View } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import { decideJoin } from '@/lib/data';
import { usePendingRequests } from '@/lib/useJoinRequests';
import { Avatar, Body, Button, Card, ErrorNote, Heading, Small } from '@/components/ui';
import { colors, space } from '@/theme';

// For the person who started a circle: the people holding the invite link who are waiting to be let in.
// Shows nothing when nobody is waiting.
export default function JoinRequests({ circleId, circleName, isStarter }: { circleId: string; circleName?: string; isStarter: boolean }) {
  const rows = usePendingRequests(circleId, isStarter);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (rows.length === 0) return null;

  async function decide(uid: string, approve: boolean) {
    setBusy(uid);
    setError(null);
    try {
      await decideJoin(circleId, uid, approve);
    } catch {
      setError('Could not save that. Try again in a moment.');
    }
    setBusy(null);
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <UserPlus size={20} color={colors.accent} strokeWidth={2.25} />
        <Heading>{circleName ? `Waiting to join ${circleName}` : 'Waiting to join'}</Heading>
      </View>
      {rows.map((r) => (
        <Card key={r.uid} style={{ gap: space.sm, backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={r.name} id={r.uid} colorKey={r.color} size={44} />
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>{r.name}</Body>
              <Small>{r.car ? r.car + ' · ' : ''}used your invite link. Only let in people you know.</Small>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Let them in" onPress={() => decide(r.uid, true)} loading={busy === r.uid} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" label="Decline" onPress={() => decide(r.uid, false)} disabled={busy === r.uid} />
            </View>
          </View>
        </Card>
      ))}
      <ErrorNote message={error} />
    </View>
  );
}
