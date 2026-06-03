import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function CameraScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.placeholderText}>📷</Text>
        <Text style={styles.placeholderLabel}>Camera Ready</Text>
        <Text style={styles.placeholderSubtext}>Position Braille document in frame</Text>
      </View>
      
      <TouchableOpacity style={styles.captureButton}>
        <Text style={styles.captureButtonText}>Capture</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 80,
    opacity: 0.5,
  },
  placeholderLabel: {
    fontSize: 24,
    color: '#fff',
    marginTop: 20,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#888',
    marginTop: 10,
  },
  captureButton: {
    position: 'absolute',
    bottom: 30,
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 30,
  },
  captureButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
});