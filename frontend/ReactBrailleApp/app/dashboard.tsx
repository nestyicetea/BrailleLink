import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Image } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';
import { useDisplay } from '../context/DisplayContext';

interface RecentImage {
  image_id: number;
  image_name: string;
  image_path: string;
  image_url?: string;
  output_text: string;
  created_at: string;
  folder?: {
    folder_id: number;
    folder_name: string;
  };
}

export default function DashboardScreen() {
  const { theme } = useDisplay();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ folders: 0, images: 0, todayScans: 0, storageMB: 0 });
  const [recentImages, setRecentImages] = useState<RecentImage[]>([]);

  useEffect(() => {
    loadStats();
    loadRecentActivity();
  }, []);

  const loadStats = async () => {
    try {
      const foldersRes = await AxiosInstance.get('/folders/');
      const imagesRes = await AxiosInstance.get('/images/');
      
      const today = new Date().toISOString().split('T')[0];
      const todayScans = imagesRes.data?.images?.filter((img: { created_at?: string }) => img.created_at?.startsWith(today)).length || 0;
      const totalBytes = imagesRes.data?.images?.reduce((sum: number, img: { file_size?: number }) => sum + (img.file_size || 0), 0) || 0;
      const storageMB = (totalBytes / (1024 * 1024)).toFixed(1);
      
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

  const loadRecentActivity = async () => {
    try {
      const [imagesRes, foldersRes] = await Promise.all([
        AxiosInstance.get('/images/'),
        AxiosInstance.get('/folders/')
      ]);
      
      const images = imagesRes.data?.images || [];
      const folders = foldersRes.data?.folders || [];
      
      // Create a folder map for quick lookup
      const folderMap = new Map(folders.map((f: any) => [f.folder_id, f]));
      
      // Enrich images with folder info
      const enrichedImages = images.map((img: any) => ({
        ...img,
        folder: img.folder ? folderMap.get(img.folder) : undefined
      }));
      
      // Sort by created_at and take the 5 most recent
      const sorted = enrichedImages.sort((a: RecentImage, b: RecentImage) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setRecentImages(sorted.slice(0, 5));
    } catch (error) {
      console.error(error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadRecentActivity()]);
    setRefreshing(false);
  }, []);

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textMuted} />}
    >
      {/* Main Stats Row */}
      <View style={[styles.statsRow, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.statItem} onPress={() => router.push('/files')}>
          <Text style={[styles.statValue, { color: theme.text }]}>{stats.folders}</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>folders</Text>
        </TouchableOpacity>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <TouchableOpacity style={styles.statItem} onPress={() => router.push('/files')}>
          <Text style={[styles.statValue, { color: theme.text }]}>{stats.images}</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>images</Text>
        </TouchableOpacity>
      </View>

      {/* Secondary Stats Row - New */}
      <View style={[styles.secondaryStatsRow, { borderBottomColor: theme.border }]}>
        <View style={styles.secondaryStatItem}>
          <Ionicons name="today-outline" size={20} color={theme.accent} />
          <Text style={[styles.secondaryStatValue, { color: theme.text }]}>{stats.todayScans}</Text>
          <Text style={[styles.secondaryStatLabel, { color: theme.textMuted }]}>scans today</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.secondaryStatItem}>
          <Ionicons name="cloud-outline" size={20} color={theme.accent} />
          <Text style={[styles.secondaryStatValue, { color: theme.text }]}>{stats.storageMB}</Text>
          <Text style={[styles.secondaryStatLabel, { color: theme.textMuted }]}>MB used</Text>
        </View>
      </View>

      {/* Recent Activity */}
      <View style={styles.recentSection}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Activity</Text>
          {recentImages.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/recents')}>
              <Text style={[styles.seeAllText, { color: theme.accent }]}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentImages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={theme.border} />
            <Text style={[styles.emptyStateText, { color: theme.text }]}>No scans yet</Text>
            <Text style={[styles.emptyStateSubtext, { color: theme.textMuted }]}>Start scanning Braille documents</Text>
            <TouchableOpacity 
              style={[styles.emptyStateButton, { backgroundColor: theme.accent }]}
              onPress={() => router.push('/camera')}
            >
              <Ionicons name="camera" size={18} color="#fff" />
              <Text style={styles.emptyStateButtonText}>Start Scanning</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.activityList}>
            {recentImages.map((image) => (
              <TouchableOpacity
                key={image.image_id}
                style={[styles.activityItem, { backgroundColor: theme.surface }]}
                onPress={async () => {
                  if (image.folder) {
                    // Navigate to the folder containing this image
                    try {
                      const folderRes = await AxiosInstance.get(`/folders/${image.folder.folder_id}/`);
                      router.push({
                        pathname: '/view-folder',
                        params: { 
                          folderId: image.folder.folder_id, 
                          folderName: image.folder.folder_name || folderRes.data?.folder_name
                        }
                      });
                    } catch (error) {
                      console.error('Error navigating to folder:', error);
                      router.push('/files');
                    }
                  } else {
                    router.push('/files');
                  }
                }}
                activeOpacity={0.7}
              >
                {image.image_url ? (
                  <View style={[styles.activityImageWrap, { backgroundColor: theme.surface }]}>
                    <Image 
                      source={{ uri: image.image_url }} 
                      style={styles.activityThumbnail}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View style={[styles.activityIcon, { backgroundColor: theme.highlight }]}>
                    <Ionicons name="document-text" size={20} color={theme.accent} />
                  </View>
                )}
                
                <View style={styles.activityContent}>
                  <Text style={[styles.activityTitle, { color: theme.text }]} numberOfLines={1}>
                    {image.image_name || 'Untitled'}
                  </Text>
                  <Text style={[styles.activitySubtitle, { color: theme.textMuted }]} numberOfLines={1}>
                    {image.output_text ? 
                      `${image.output_text.substring(0, 40)}${image.output_text.length > 40 ? '...' : ''}` : 
                      'No text extracted'
                    }
                  </Text>
                </View>

                <View style={styles.activityMeta}>
                  <Text style={[styles.activityTime, { color: theme.textMuted }]}>
                    {formatTimeAgo(image.created_at)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  },
  statsRow: {
    flexDirection: 'row',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 0,
    alignItems: 'center',
    borderBottomWidth: 0.5,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '300',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 0.5,
    height: 30,
  },
  secondaryStatsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 0,
    alignItems: 'center',
    borderBottomWidth: 0.5,
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
  },
  secondaryStatLabel: {
    fontSize: 11,
  },
  recentSection: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  activityList: {
    gap: 0,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityImageWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  activityThumbnail: {
    width: 40,
    height: 40,
  },
  activityContent: {
    flex: 1,
    marginRight: 8,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 13,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityTime: {
    fontSize: 12,
    fontWeight: '500',
  },
});
