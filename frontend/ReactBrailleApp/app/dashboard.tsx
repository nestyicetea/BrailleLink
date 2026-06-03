import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
  
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setRefreshing(false);
  }, []);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#0a7ea4']} // Android
          tintColor="#0a7ea4" // iOS
        />
      }
    >
      {/* <View style={styles.header}>
        <Text style={styles.welcomeTitle}>Welcome to BrailleLink!</Text>
        <Text style={styles.subtitle}>Your Braille learning companion</Text>
      </View> */}
      
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Folders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Images</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Scans</Text>
        </View>
      </View>
      
      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No recent activity</Text>
          <Text style={styles.emptySubtext}>Start by scanning or adding files</Text>
        </View>
      </View>
      
      <View style={styles.tipsSection}>
        <Text style={styles.sectionTitle}>Quick Tips</Text>
        <View style={styles.tipCard}>
          <Text style={styles.tipText}>📷 Use Camera to scan Braille documents</Text>
        </View>
        <View style={styles.tipCard}>
          <Text style={styles.tipText}>📁 Organize your scans in Files</Text>
        </View>
        <View style={styles.tipCard}>
          <Text style={styles.tipText}>💾 Sync your data across devices</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
  },
  statCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    width: '30%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0a7ea4',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  recentSection: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 30,
  },
  emptyIcon: {
    fontSize: 50,
    opacity: 0.3,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 5,
  },
  tipsSection: {
    backgroundColor: '#fff',
    margin: 20,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
  },
  tipCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  tipText: {
    fontSize: 14,
    color: '#555',
  },
});