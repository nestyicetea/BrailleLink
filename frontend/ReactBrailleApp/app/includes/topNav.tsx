import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { usePathname } from 'expo-router';

export default function TopNav() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BrailleLink</Text>
      <TouchableOpacity style={styles.profileButton}>
        <View style={styles.profileCircle}>
          <Text style={styles.profileInitial}>B</Text>
        </View>
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
  },
  profileButton: {
    padding: 5,
  },
  profileCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0a7ea4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});