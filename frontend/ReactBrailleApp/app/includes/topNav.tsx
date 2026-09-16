import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDisplay } from '../../context/DisplayContext';

export default function TopNav() {
  const { theme } = useDisplay();
  const pathname = usePathname();
  const isSettings = pathname === '/settings';

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>BrailleLink</Text>
      <TouchableOpacity
        onPress={() => router.push('/settings')}
        style={styles.settingsButton}
        accessibilityLabel="Settings"
      >
        <Ionicons
          name={isSettings ? 'settings' : 'settings-outline'}
          size={22}
          color={isSettings ? theme.accent : theme.textMuted}
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
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  settingsButton: {
    width: 32,
    alignItems: 'center',
  },
});