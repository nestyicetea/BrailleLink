import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDisplay } from '../../context/DisplayContext';

export default function TopNav() {
  const { theme } = useDisplay();
  const pathname = usePathname();
  const isSettings = pathname === '/settings';

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <View style={styles.brand}>
        <Image
          source={require('../../assets/images/braille_logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="BrailleLink logo"
        />
        <Text style={[styles.title, { color: theme.text }]}>BrailleLink</Text>
      </View>
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
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  settingsButton: {
    width: 32,
    alignItems: 'center',
  },
});