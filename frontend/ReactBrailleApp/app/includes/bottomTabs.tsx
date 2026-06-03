import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';

export default function BottomTabs() {
  const pathname = usePathname();

  const tabs = [
    { name: 'Dashboard', route: '/dashboard', icon: '📊' },
    { name: 'Files', route: '/files', icon: '📁' },
  ];

  return (
    <View style={styles.container}>
      {/* Left Tab - Dashboard */}
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push('/dashboard')}
      >
        <Text style={styles.icon}>📊</Text>
        <Text style={[
          styles.label,
          pathname === '/dashboard' && styles.activeLabel
        ]}>
          Dashboard
        </Text>
      </TouchableOpacity>

      {/* Center FAB - Camera/Scan */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/camera')}
      >
        <View style={styles.fabInner}>
          <Text style={styles.fabIcon}>📷</Text>
          <Text style={styles.fabLabel}>Scan</Text>
        </View>
      </TouchableOpacity>

      {/* Right Tab - Files */}
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push('/files')}
      >
        <Text style={styles.icon}>📁</Text>
        <Text style={[
          styles.label,
          pathname === '/files' && styles.activeLabel
        ]}>
          Files
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  icon: {
    fontSize: 24,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: '#888',
  },
  activeLabel: {
    color: '#0a7ea4',
    fontWeight: 'bold',
  },
  // FAB Styles
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  },
  fabInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
    marginBottom: 2,
  },
  fabLabel: {
    fontSize: 11,
    color: '#fff',
    fontWeight: 'bold',
  },
});