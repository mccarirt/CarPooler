import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '@/lib/session';
import { loadFonts } from '@/lib/fonts';
import { setUpHead } from '@/lib/head';
import LocationSharer from '@/components/LocationSharer';
import JoinWatcher from '@/components/JoinWatcher';
import { colors, mode } from '@/theme';

loadFonts();
setUpHead();

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <LocationSharer />
      <JoinWatcher />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </SessionProvider>
  );
}
