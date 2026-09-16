import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Image } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';
import { useDisplay } from '../context/DisplayContext';

interface RecentImage {
  image_id: number;
  image_name: string;
  image_url?: string;
  output_text: string;
  created_at: string;
  folder?: {
    folder_id: number;
    folder_name: string;
  };
}

export default function RecentsScreen() {
  const { theme } = useDisplay();
  const [refreshing, setRefreshing] = useState(false);
  const [images, setImages] = useState<RecentImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    loadRecents();
  }, []);

  const loadRecents = async () => {
    try {
      const [imagesRes, foldersRes] = await Promise.all([
        AxiosInstance.get('/images/'),
        AxiosInstance.get('/folders/'),
      ]);

      const folderMap = new Map(
        (foldersRes.data?.folders || []).map((f: any) => [f.folder_id, f])
      );

      const enriched = (imagesRes.data?.images || []).map((img: any) => ({
        ...img,
        folder: img.folder ? folderMap.get(img.folder) : undefined,
      }));

      enriched.sort((a: RecentImage, b: RecentImage) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );      setImages(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecents();
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

  const handlePress = async (image: RecentImage) => {
    if (image.folder) {
      router.push({
        pathname: '/view-folder',
        params: {
          folderId: image.folder.folder_id,
          folderName: image.folder.folder_name,
        },
      });
    } else {
      router.push('/files');
    }
  };

  // Group images by date label
  const groupByDate = (imgs: RecentImage[]) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const groups: { label: string; data: RecentImage[] }[] = [];
    const map: Record<string, RecentImage[]> = {};

    for (const img of imgs) {
      const day = new Date(img.created_at).toISOString().split('T')[0];
      const label = day === today ? 'Today' : day === yesterday ? 'Yesterday' : new Date(img.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      if (!map[label]) {
        map[label] = [];
        groups.push({ label, data: map[label] });
      }
      map[label].push(img);
    }

    return groups;
  };

  const getFilteredImages = () => {
    let filtered = [...images];
    if (searchQuery) {
      filtered = filtered.filter(img =>
        (img.image_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (img.folder?.folder_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    filtered.sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });
    return filtered;
  };

  const groups = groupByDate(getFilteredImages());

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Recents</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search & Filter */}
      <View style={[styles.searchContainer, { borderBottomColor: theme.border }]}>
        <View style={[styles.searchBar, { borderBottomColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search"
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
        >
          <View style={[styles.filterButtonInner, { backgroundColor: theme.surface }]}>
            <Ionicons name="swap-vertical-outline" size={18} color={theme.text} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading...</Text>
        ) : images.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={52} color={theme.border} />
            <Text style={[styles.emptyText, { color: theme.text }]}>No recent activity</Text>
            <Text style={[styles.emptySubtext, { color: theme.textMuted }]}>Your scans will appear here</Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.label}>
              <Text style={[styles.groupLabel, { color: theme.textMuted }]}>{group.label}</Text>
              {group.data.map((image) => (
                <TouchableOpacity
                  key={image.image_id}
                  style={[styles.item, { backgroundColor: theme.surface }]}
                  onPress={() => handlePress(image)}
                  activeOpacity={0.7}
                >
                  {image.image_url ? (
                    <View style={[styles.imageWrap, { backgroundColor: theme.surface }]}>
                      <Image 
                        source={{ uri: image.image_url }} 
                        style={styles.thumbnail}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View style={[styles.iconWrap, { backgroundColor: theme.highlight }]}>
                      <Ionicons name="document-text" size={20} color={theme.accent} />
                    </View>
                  )}

                  <View style={styles.itemContent}>
                    <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                      {image.image_name || 'Untitled'}
                    </Text>
                    <Text style={[styles.itemSub, { color: theme.textMuted }]} numberOfLines={1}>
                      {image.folder ? `📁 ${image.folder.folder_name}` : 'Unfiled'}
                      {image.output_text ? `  ·  ${image.output_text.substring(0, 30)}...` : ''}
                    </Text>
                  </View>

                  <View style={styles.itemMeta}>
                    <Text style={[styles.itemTime, { color: theme.textMuted }]}>{formatTimeAgo(image.created_at)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 0.5,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  filterButton: { height: 40, justifyContent: 'center', alignItems: 'center' },
  filterButtonInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  loadingText: { textAlign: 'center', marginTop: 40 },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, fontWeight: '600', marginTop: 16 },
  emptySubtext: { fontSize: 13, marginTop: 4 },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  imageWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 40,
    height: 40,
  },
  itemContent: { flex: 1, marginRight: 8 },
  itemTitle: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  itemSub: { fontSize: 12 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemTime: { fontSize: 12, fontWeight: '500' },
  activityMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
