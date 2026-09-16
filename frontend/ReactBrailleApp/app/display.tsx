import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Slider from '@react-native-community/slider';
import { useDisplay } from '../context/DisplayContext';

const MIN_SCALE = 0.8;
const MAX_SCALE = 1.5;
const STEP = 0.05;

const MIN_WEIGHT = 400;
const MAX_WEIGHT = 800;
const WEIGHT_STEP = 100;

export default function DisplayScreen() {
  const { fontScale, fontWeight, theme, setFontScale, setFontWeight } = useDisplay();

  const getWeightLabel = (weight: number) => {
    switch (weight) {
      case 400: return 'Default';
      case 500: return 'Medium';
      case 600: return 'Semi Bold';
      case 700: return 'Bold';
      case 800: return 'Extra Bold';
      default: return 'Default';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Font Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>Preview</Text>
        <View style={[styles.previewBox, { backgroundColor: theme.surface }]}>
          <Text
            style={[
              styles.previewText,
              {
                fontSize: 15 * fontScale,
                lineHeight: 22 * fontScale,
                fontWeight: fontWeight.toString() as any,
                color: theme.text,
              },
            ]}
          >
            The quick brown fox jumps over the lazy dog.
          </Text>
        </View>

        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>Font Size</Text>
        <View style={[styles.sliderCard, { backgroundColor: theme.surface }]}>
          <View style={styles.sliderLabelsRow}>
            <Text style={[styles.sliderSmallLabel, { color: theme.textMuted }]}>A</Text>
            <Text style={[styles.sliderValueText, { color: theme.accent }]}>{Math.round(fontScale * 100)}%</Text>
            <Text style={[styles.sliderLargeLabel, { color: theme.textMuted }]}>A</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_SCALE}
            maximumValue={MAX_SCALE}
            step={STEP}
            value={fontScale}
            onValueChange={setFontScale}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
            thumbTintColor={theme.accent}
          />
          <View style={styles.sliderRangeRow}>
            <Text style={[styles.sliderRangeText, { color: theme.textMuted }]}>Small</Text>
            <Text style={[styles.sliderRangeText, { color: theme.textMuted }]}>Large</Text>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>Font Weight</Text>
        <View style={[styles.sliderCard, { backgroundColor: theme.surface }]}>
          <View style={styles.sliderLabelsRow}>
            <Text style={[styles.weightSample, { fontWeight: '400', color: theme.textMuted }]}>Aa</Text>
            <Text style={[styles.sliderValueText, { color: theme.accent }]}>{getWeightLabel(fontWeight)}</Text>
            <Text style={[styles.weightSample, { fontWeight: '800', color: theme.textMuted }]}>Aa</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_WEIGHT}
            maximumValue={MAX_WEIGHT}
            step={WEIGHT_STEP}
            value={fontWeight}
            onValueChange={setFontWeight}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
            thumbTintColor={theme.accent}
          />
          <View style={styles.sliderRangeRow}>
            <Text style={[styles.sliderRangeText, { color: theme.textMuted }]}>Default</Text>
            <Text style={[styles.sliderRangeText, { color: theme.textMuted }]}>Extra Bold</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  placeholder: { width: 40 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sliderCard: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sliderLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sliderSmallLabel: { fontSize: 14, fontWeight: '500' },
  sliderLargeLabel: { fontSize: 22, fontWeight: '500' },
  weightSample: { fontSize: 18 },
  sliderValueText: { fontSize: 15, fontWeight: '700' },
  slider: { width: '100%', height: 40 },
  sliderRangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderRangeText: { fontSize: 11 },
  previewBox: {
    borderRadius: 12,
    padding: 20,
    height: 110,
    justifyContent: 'center',
  },
  previewText: {},
});