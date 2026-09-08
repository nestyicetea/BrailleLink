import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TopNav() {
  const pathname = usePathname();
  const isSettings = pathname === '/settings';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BrailleLink</Text>
      <TouchableOpacity
        onPress={() => router.push('/settings')}
        style={styles.settingsButton}
        accessibilityLabel="Settings"
      >
        <Ionicons
          name={isSettings ? 'settings' : 'settings-outline'}
          size={22}
          color={isSettings ? '#DC143C' : '#555'}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  settingsButton: {
    width: 32,
    alignItems: 'center',
  },
});