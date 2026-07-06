import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';



export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ folders: 0, images: 0, todayScans: 0, storageMB: 0 });

  useEffect(() => {
    loadStats();
    // startNewGame();
  }, []);

  const loadStats = async () => {
    try {
      const foldersRes = await AxiosInstance.get('/folders/');
      const imagesRes = await AxiosInstance.get('/images/');
      
      const today = new Date().toISOString().split('T')[0];
      const todayScans = imagesRes.data?.images?.filter((img: { created_at?: string }) => img.created_at?.startsWith(today)).length || 0;
      const storageMB = (imagesRes.data?.images?.length * 0.5).toFixed(1);
      
      setStats({
        folders: foldersRes.data?.folders?.length || 0,
        images: imagesRes.data?.images?.length || 0,
        todayScans: todayScans,
        storageMB: parseFloat(storageMB),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, []);

  

  return (
    <ScrollView 
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#999" />}
    >
      {/* Main Stats Row */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statItem} onPress={() => router.push('/files')}>
          <Text style={styles.statValue}>{stats.folders}</Text>
          <Text style={styles.statLabel}>folders</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.statItem} onPress={() => router.push('/files')}>
          <Text style={styles.statValue}>{stats.images}</Text>
          <Text style={styles.statLabel}>images</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{/* score */ 0}</Text>
          <Text style={styles.statLabel}>score</Text>
        </View>
      </View>

      {/* Secondary Stats Row - New */}
      <View style={styles.secondaryStatsRow}>
        <View style={styles.secondaryStatItem}>
          <Ionicons name="today-outline" size={20} color="#DC143C" />
          <Text style={styles.secondaryStatValue}>{stats.todayScans}</Text>
          <Text style={styles.secondaryStatLabel}>scans today</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.secondaryStatItem}>
          <Ionicons name="cloud-outline" size={20} color="#DC143C" />
          <Text style={styles.secondaryStatValue}>{stats.storageMB}</Text>
          <Text style={styles.secondaryStatLabel}>MB used</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionChip} onPress={() => router.push('/camera')}>
          <Ionicons name="camera-outline" size={18} color="#DC143C" />
          <Text style={styles.actionChipText}>Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => router.push('/files')}>
          <Ionicons name="folder-outline" size={18} color="#DC143C" />
          <Text style={styles.actionChipText}>Files</Text>
        </TouchableOpacity>
      </View>

      {/* Braille Game - Commented Out */}
      {/* <View style={styles.gameContainer}>
        <View style={styles.gameHeader}>
          <Text style={styles.gameTitle}>learn braille</Text>
        </View>

        <View style={styles.gameCard}>
          <BrailleCell dots={currentQuestion?.dots || []} />
          
          <View style={styles.optionsRow}>
            {options.map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.optionBtn}
                onPress={() => handleAnswer(option.letter)}
              >
                <Text style={styles.optionLetter}>{option.letter}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {feedback !== '' && (
            <Text style={[styles.feedback, feedback.includes('✓') ? styles.feedbackCorrect : styles.feedbackWrong]}>
              {feedback}
            </Text>
          )}
        </View>
      </View> */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 0,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '300',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 0.5,
    height: 30,
    backgroundColor: '#E5E5EA',
  },
  secondaryStatsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 0,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  secondaryStatItem: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  secondaryStatLabel: {
    fontSize: 11,
    color: '#8E8E93',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
  },
  actionChipText: {
    fontSize: 13,
    color: '#DC143C',
    fontWeight: '500',
  },
  // Braille game styles - commented out
  // gameContainer: {
  //   padding: 20,
  // },
  // gameHeader: {
  //   marginBottom: 16,
  // },
  // gameTitle: {
  //   fontSize: 13,
  //   fontWeight: '500',
  //   color: '#8E8E93',
  //   textTransform: 'uppercase',
  //   letterSpacing: 0.8,
  // },
  // gameCard: {
  //   alignItems: 'center',
  //   paddingVertical: 32,
  //   paddingHorizontal: 20,
  //   borderRadius: 16,
  //   backgroundColor: '#F9F9FB',
  // },
  // brailleCell: {
  //   flexDirection: 'row',
  //   justifyContent: 'center',
  //   marginBottom: 28,
  // },
  // dot: {
  //   width: 14,
  //   height: 14,
  //   borderRadius: 7,
  //   backgroundColor: '#E5E5EA',
  //   marginVertical: 5,
  // },
  // dotActive: {
  //   backgroundColor: '#1A1A1A',
  // },
  // optionsRow: {
  //   flexDirection: 'row',
  //   flexWrap: 'wrap',
  //   justifyContent: 'center',
  //   gap: 12,
  //   marginBottom: 20,
  // },
  // optionBtn: {
  //   width: 56,
  //   height: 56,
  //   borderRadius: 28,
  //   backgroundColor: '#FFFFFF',
  //   alignItems: 'center',
  //   justifyContent: 'center',
  //   borderWidth: 0.5,
  //   borderColor: '#E5E5EA',
  // },
  // optionLetter: {
  //   fontSize: 22,
  //   fontWeight: '400',
  //   color: '#1A1A1A',
  // },
  // feedback: {
  //   fontSize: 13,
  //   fontWeight: '500',
  //   marginTop: 8,
  // },
  // feedbackCorrect: {
  //   color: '#4CAF50',
  // },
  // feedbackWrong: {
  //   color: '#FF6B6B',
  // },
});