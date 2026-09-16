import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useDisplay, ColorMode } from '../context/DisplayContext';

const SETTINGS_KEYS = {
  TTS_AUTOPLAY: 'tts_autoplay',
};

const THEME_OPTIONS: { mode: ColorMode; label: string; icon: string; description: string }[] = [
  { mode: 'light', label: 'Light', icon: 'sunny', description: 'Clean and bright interface' },
  { mode: 'dark', label: 'Dark', icon: 'moon', description: 'Easy on the eyes at night' },
  { mode: 'sepia', label: 'Sepia', icon: 'book', description: 'Warm tones for reading' },
  { mode: 'system', label: 'Auto', icon: 'phone-portrait', description: 'Match device settings' },
];

export default function SettingsScreen() {
  const { theme, colorMode, setColorMode } = useDisplay();
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
    <View style={[styles.wrapper, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Text-to-Speech Section */}
        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>Text-to-Speech</Text>
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="volume-high-outline" size={20} color={theme.accent} style={styles.rowIcon} />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>Auto-Play Speech</Text>
                <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>Automatically read outputs when opened</Text>
              </View>
            </View>
            <Switch
              value={ttsAutoPlay}
              onValueChange={toggleAutoPlay}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Display Section */}
        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>Display</Text>
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/display')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="text-outline" size={20} color={theme.accent} style={styles.rowIcon} />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>Font Settings</Text>
                <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>Font size and text weight</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Appearance Section */}
        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>Appearance</Text>
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {THEME_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.mode}
              style={styles.row}
              onPress={() => setColorMode(option.mode)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name={option.icon as any} size={20} color={colorMode === option.mode ? theme.accent : theme.textMuted} style={styles.rowIcon} />
                <View>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>{option.label}</Text>
                  <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>{option.description}</Text>
                </View>
              </View>
              {colorMode === option.mode && (
                <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Storage Section */}
        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>Storage</Text>
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity 
            style={styles.row}
            onPress={() => router.push('/recently-deleted')}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color={theme.accent} style={styles.rowIcon} />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text }]}>Recently Deleted</Text>
                <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>Manage deleted folders and images</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
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
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  section: {
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
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
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});