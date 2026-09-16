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
  const { fontScale, fontWeight, setFontScale, setFontWeight } = useDisplay();

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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Display</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionHeader}>Preview</Text>
        <View style={styles.previewBox}>
          <Text
            style={[
              styles.previewText,
              {
                fontSize: 15 * fontScale,
                lineHeight: 22 * fontScale,
                fontWeight: fontWeight.toString() as any,
              },
            ]}
          >
            The quick brown fox jumps over the lazy dog.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>Font Size</Text>
        <View style={styles.sliderCard}>
          <View style={styles.sliderLabelsRow}>
            <Text style={styles.sliderSmallLabel}>A</Text>
            <Text style={styles.sliderValueText}>{Math.round(fontScale * 100)}%</Text>
            <Text style={styles.sliderLargeLabel}>A</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_SCALE}
            maximumValue={MAX_SCALE}
            step={STEP}
            value={fontScale}
            onValueChange={setFontScale}
            minimumTrackTintColor="#DC143C"
            maximumTrackTintColor="#E5E5EA"
            thumbTintColor="#DC143C"
          />
          <View style={styles.sliderRangeRow}>
            <Text style={styles.sliderRangeText}>Small</Text>
            <Text style={styles.sliderRangeText}>Large</Text>
          </View>
        </View>

        <Text style={styles.sectionHeader}>Font Weight</Text>
        <View style={styles.sliderCard}>
          <View style={styles.sliderLabelsRow}>
            <Text style={[styles.weightSample, { fontWeight: '400' }]}>Aa</Text>
            <Text style={styles.sliderValueText}>{getWeightLabel(fontWeight)}</Text>
            <Text style={[styles.weightSample, { fontWeight: '800' }]}>Aa</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_WEIGHT}
            maximumValue={MAX_WEIGHT}
            step={WEIGHT_STEP}
            value={fontWeight}
            onValueChange={setFontWeight}
            minimumTrackTintColor="#DC143C"
            maximumTrackTintColor="#E5E5EA"
            thumbTintColor="#DC143C"
          />
          <View style={styles.sliderRangeRow}>
            <Text style={styles.sliderRangeText}>Default</Text>
            <Text style={styles.sliderRangeText}>Extra Bold</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: { width: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  placeholder: { width: 40 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sliderCard: {
    backgroundColor: '#F8F8F8',
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
  sliderSmallLabel: { fontSize: 14, color: '#8E8E93', fontWeight: '500' },
  sliderLargeLabel: { fontSize: 22, color: '#8E8E93', fontWeight: '500' },
  weightSample: { fontSize: 18, color: '#8E8E93' },
  sliderValueText: { fontSize: 15, color: '#DC143C', fontWeight: '700' },
  slider: { width: '100%', height: 40 },
  sliderRangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderRangeText: { fontSize: 11, color: '#8E8E93' },
  previewBox: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 20,
    height: 110,
    justifyContent: 'center',
  },
  previewText: { color: '#1A1A1A' },
});