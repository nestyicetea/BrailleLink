import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const SETTINGS_KEYS = {
  TTS_AUTOPLAY: 'tts_autoplay',
};

export default function SettingsScreen() {
  const [ttsAutoPlay, setTtsAutoPlay] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEYS.TTS_AUTOPLAY).then((val) => {
      setTtsAutoPlay(val === 'true');
    });
  }, []);

  const toggleAutoPlay = (value: boolean) => {
    setTtsAutoPlay(value);
    AsyncStorage.setItem(SETTINGS_KEYS.TTS_AUTOPLAY, value ? 'true' : 'false');
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Text-to-Speech Section */}
        <Text style={styles.sectionHeader}>Text-to-Speech</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="volume-high-outline" size={20} color="#DC143C" style={styles.rowIcon} />
              <View>
                <Text style={styles.rowTitle}>Auto-Play Speech</Text>
                <Text style={styles.rowSubtitle}>Automatically read outputs when opened</Text>
              </View>
            </View>
            <Switch
              value={ttsAutoPlay}
              onValueChange={toggleAutoPlay}
              trackColor={{ false: '#E5E5EA', true: '#DC143C' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  headerPlaceholder: {
    width: 32,
  },
  container: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#E5E5EA',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  rowIcon: {
    marginRight: 14,
  },
  rowTitle: {
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
});
