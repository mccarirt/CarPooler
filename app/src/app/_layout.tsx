import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '@/lib/session';
import { loadFonts } from '@/lib/fonts';
import LocationSharer from '@/components/LocationSharer';
import { colors } from '@/theme';

loadFonts();

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <LocationSharer />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </SessionProvider>
  );
}
