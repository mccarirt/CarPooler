import { ActivityIndicator } from 'react-native';
import { Tabs } from 'expo-router';
import { CalendarDays, Sun, User, Users } from 'lucide-react-native';
import { useSession } from '@/lib/session';
import Welcome from '@/components/Welcome';
import { Centered } from '@/components/ui';
import { colors, font } from '@/theme';

// The bar stays pinned to the bottom of the screen. Only the page above it scrolls, so it never
// moves or hides while you scroll. The ride-day screen and the circle pages open full screen on top.
export default function TabsLayout() {
  const { loading, profile } = useSession();

  if (loading)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  if (!profile) return <Welcome />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 68,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: font.family, fontSize: 12, fontWeight: '700' },
        tabBarItemStyle: { minHeight: 56 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ color }) => <Sun size={24} color={color} strokeWidth={2.25} /> }} />
      <Tabs.Screen name="week" options={{ title: 'Week', tabBarIcon: ({ color }) => <CalendarDays size={24} color={color} strokeWidth={2.25} /> }} />
      <Tabs.Screen name="circles" options={{ title: 'Circles', tabBarIcon: ({ color }) => <Users size={24} color={color} strokeWidth={2.25} /> }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: ({ color }) => <User size={24} color={color} strokeWidth={2.25} /> }} />
    </Tabs>
  );
}
