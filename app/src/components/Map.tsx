import { Text, View } from 'react-native';
import { colors, radius, space } from '@/theme';
import type { MapProps } from './mapTypes';

// Native fallback. The prototype ships as a web build; a native map comes in Phase 6.
export default function Map(_: MapProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunk, padding: space.lg, borderRadius: radius.md }}>
      <Text style={{ color: colors.inkSoft }}>The live map is available in the web version for now.</Text>
    </View>
  );
}
