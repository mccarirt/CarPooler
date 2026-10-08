import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Carpool Circle</Text>
      <Text style={styles.sub}>Phase 0: the app is live. Nothing to see yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F0', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '700', color: '#2B2118' },
  sub: { marginTop: 8, fontSize: 16, color: '#6B5D4F' },
});
