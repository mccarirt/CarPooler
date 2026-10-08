import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useCircleName } from '@/lib/useCircleName';
import { useMemberships } from '@/lib/useMemberships';
import { addDays, mondayOf, shortDate, toISO } from '@/lib/schedule';
import { WeekFeed } from '@/components/TodayFeed';
import { EmptyState, Heading, Screen, SkeletonCard, Small, Title } from '@/components/ui';
import { colors, space } from '@/theme';

// Week: what is coming up, across every circle. The Sunday-night planning view.
export default function Week() {
  const rows = useMemberships();
  const thisWeek = mondayOf(toISO(new Date()));
  const [weekStart, setWeekStart] = useState(thisWeek);

  return (
    <Screen tab>
      <View style={{ height: space.sm }} />
      <Title>This week</Title>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <NavBtn label="Previous week" onPress={() => setWeekStart(addDays(weekStart, -7))} icon={<ChevronLeft size={22} color={colors.ink} />} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Heading>
            {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
          </Heading>
          {weekStart !== thisWeek && (
            <Pressable accessibilityRole="button" onPress={() => setWeekStart(thisWeek)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Small style={{ color: colors.accent }}>Back to this week</Small>
            </Pressable>
          )}
        </View>
        <NavBtn label="Next week" onPress={() => setWeekStart(addDays(weekStart, 7))} icon={<ChevronRight size={22} color={colors.ink} />} />
      </View>

      {rows === null ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={24} color={colors.accent} strokeWidth={2} />}
          title="Your week starts here"
          body="Once you are in a circle with rides set up, every ride for the week shows up in one list."
          action={{ label: 'Go to Circles', variant: 'secondary', onPress: () => router.push('/circles') }}
        />
      ) : (
        <>
          <WeekFeed circleIds={rows.map((r) => r.id)} weekStart={weekStart} />
          <View style={{ gap: space.xs, marginTop: space.md }}>
            <Small>Skip a day, change a time, or add a note:</Small>
            {rows.map((r) => (
              <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push(`/circle/${r.id}/agenda`)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <EditLink id={r.id} fallback={r.circleName} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function NavBtn({ label, onPress, icon }: { label: string; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunk }}
    >
      {icon}
    </Pressable>
  );
}

function EditLink({ id, fallback }: { id: string; fallback: string }) {
  const name = useCircleName(id, fallback);
  return <Small style={{ color: colors.accent, fontWeight: '700' }}>Edit the {name} schedule</Small>;
}
