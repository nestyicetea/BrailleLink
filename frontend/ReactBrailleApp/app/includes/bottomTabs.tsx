import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function BottomTabs() {
  const pathname = usePathname();

  const isDashboard = pathname === '/dashboard';
  const isFiles = pathname === '/files';
  const isSettings = pathname === '/settings';

  return (
    <View style={styles.wrapper}>
      {/* Curved cutout background */}
      <View style={styles.container}>

        {/* Dashboard Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => router.push('/dashboard')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrapper, isDashboard && styles.iconWrapperActive]}>
            <Ionicons
              name={isDashboard ? 'grid' : 'grid-outline'}
              size={22}
              color={isDashboard ? '#DC143C' : '#9E9E9E'}
            />
          </View>
          <Text style={[styles.label, isDashboard && styles.activeLabel]}>Dashboard</Text>
        </TouchableOpacity>

        {/* Center spacer for FAB */}
        <View style={styles.fabSpacer} />

        {/* Files Tab */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => router.push('/files')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrapper, isFiles && styles.iconWrapperActive]}>
            <Ionicons
              name={isFiles ? 'folder' : 'folder-outline'}
              size={22}
              color={isFiles ? '#DC143C' : '#9E9E9E'}
            />
          </View>
          <Text style={[styles.label, isFiles && styles.activeLabel]}>Files</Text>
        </TouchableOpacity>
      </View>

      {/* FAB — sits above the bar */}
      <TouchableOpacity
        style={styles.fabContainer}
        onPress={() => router.push('/camera')}
        activeOpacity={0.85}
      >
        <View style={styles.fabRing}>
          <View style={styles.fabInner}>
            <Ionicons name="camera" size={26} color="#fff" />
            <Text style={styles.fabLabel}>Scan</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const TAB_BAR_HEIGHT = 70;
const FAB_SIZE = 68;
const FAB_RING = FAB_SIZE + 10;

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
  },

  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    height: TAB_BAR_HEIGHT,
    paddingBottom: Platform.OS === 'ios' ? 10 : 0,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    // Shadow
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: -3 },
    // shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
    width: '100%',
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 10,
  },

  iconWrapper: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },

  iconWrapperActive: {
    backgroundColor: '#FFF0F0',
  },

  label: {
    fontSize: 11,
    color: '#9E9E9E',
    marginTop: 3,
    fontWeight: '500',
  },

  activeLabel: {
    color: '#DC143C',
    fontWeight: '700',
  },

  // Empty space in the middle for FAB
  fabSpacer: {
    width: FAB_RING + 16,
  },

  // FAB floats above
  fabContainer: {
    position: 'absolute',
    top: -(FAB_RING / 2),
    alignSelf: 'center',
    zIndex: 20,
  },

  fabRing: {
    width: FAB_RING,
    height: FAB_RING,
    borderRadius: FAB_RING / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    // Matches bar shadow so it blends
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: -2 },
    // shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 12,
  },

  fabInner: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
    // shadowColor: '#DC143C',
    // shadowOffset: { width: 0, height: 4 },
    // shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },

  fabLabel: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
    marginTop: 1,
    letterSpacing: 0.3,
  },
});