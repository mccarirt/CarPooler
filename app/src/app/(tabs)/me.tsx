import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Car, ChevronRight, Pencil } from 'lucide-react-native';
import PlacesSection from '@/components/PlacesSection';
import { useCircleName } from '@/lib/useCircleName';
import { useMemberships } from '@/lib/useMemberships';
import { useSession } from '@/lib/session';
import { useCircle } from '@/lib/useCircle';
import { guardiansOf, setHousehold } from '@/lib/data';
import { Avatar, Body, Button, Card, Chip, Heading, Screen, Small, Title, Wrap } from '@/components/ui';
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

      <HouseholdSection circleIds={(rows ?? []).map((r) => ({ id: r.id, name: r.circleName }))} />

      <PlacesSection />

      <Heading>Your children</Heading>
      {rows && rows.length > 0 ? (
        rows.map((r) => <ChildrenIn key={r.id} circleId={r.id} circleName={r.circleName} uid={uid} />)
      ) : (
        <Body soft>Children you add to a circle show up here.</Body>
      )}

      <Button variant="ghost" label="Diagnostics (for troubleshooting)" onPress={() => router.push('/debug')} />

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

// Who shares your children. Pick your partner once and every child you add (now or later) is theirs
// too: they see the kids' days on their Today tab and can edit their profiles.
function HouseholdSection({ circleIds }: { circleIds: { id: string; name: string }[] }) {
  const { profile, uid } = useSession();
  const household = profile?.household ?? [];
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function toggle(otherUid: string, otherName: string) {
    const on = household.includes(otherUid);
    const next = on ? household.filter((x) => x !== otherUid) : [...household, otherUid];
    setBusy(true);
    setNote(null);
    try {
      const changed = await setHousehold(next, household);
      const first = otherName.split(' ')[0];
      setNote(
        on
          ? `${first} is no longer in your household.`
          : changed > 0
            ? `Done. ${first} now shares ${changed} ${changed === 1 ? 'child' : 'children'} with you.`
            : `Done. ${first} will share every child you add from now on.`,
      );
    } catch {
      setNote('Could not save that. Try again in a moment.');
    }
    setBusy(false);
  }

  return (
    <Card style={{ gap: space.sm }}>
      <Heading>Your household</Heading>
      <Small>The other parents who share your children. They see the kids' days on their Today tab and can edit their profiles. Pick them once.</Small>
      {circleIds.map((c) => (
        <HouseholdPeople key={c.id} circleId={c.id} circleName={c.name} uid={uid} household={household} showName={circleIds.length > 1} busy={busy} onToggle={toggle} />
      ))}
      {note && <Small style={{ color: colors.ok, fontWeight: '600' }}>{note}</Small>}
    </Card>
  );
}

function HouseholdPeople({
  circleId, circleName, uid, household, showName, busy, onToggle,
}: {
  circleId: string; circleName: string; uid: string | null; household: string[]; showName: boolean; busy: boolean; onToggle: (uid: string, name: string) => void;
}) {
  const { members } = useCircle(circleId);
  const others = members.filter((m) => m.uid !== uid);
  if (others.length === 0)
    return <Small>{showName ? `${circleName}: ` : ''}When your partner joins this circle, they will show up here.</Small>;
  return (
    <View style={{ gap: space.xs }}>
      {showName && <Small>{circleName}</Small>}
      <Wrap>
        {others.map((m) => (
          <Chip key={m.uid} label={m.name} on={household.includes(m.uid)} onPress={() => (busy ? undefined : onToggle(m.uid, m.name))} />
        ))}
      </Wrap>
    </View>
  );
}
