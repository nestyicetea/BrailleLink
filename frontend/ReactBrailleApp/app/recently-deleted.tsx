import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Image } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';

interface DeletedItem {
  type: 'folder' | 'image';
  id: number;
  name: string;
  deleted_at: string;
  folder_name?: string;
  image_url?: string;
}

export default function RecentlyDeletedScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeletedItems();
  }, []);

  const loadDeletedItems = async () => {
    try {
      const [foldersRes, imagesRes] = await Promise.all([
        AxiosInstance.get('/folders/recently_deleted/'),
        AxiosInstance.get('/images/recently_deleted/'),
      ]);

      const deletedFolders: DeletedItem[] = (foldersRes.data?.folders || []).map((f: any) => ({
        type: 'folder' as const,
        id: f.folder_id,
        name: f.folder_name,
        deleted_at: f.deleted_at,
      }));

      const deletedImages: DeletedItem[] = (imagesRes.data?.images || []).map((img: any) => ({
        type: 'image' as const,
        id: img.image_id,
        name: img.image_name || 'Untitled',
        deleted_at: img.deleted_at,
        folder_name: img.folder?.folder_name,
        image_url: img.image_url,
      }));

      const allItems = [...deletedFolders, ...deletedImages].sort(
        (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
      );

      setItems(allItems);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load deleted items');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDeletedItems();
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

  const handleRestore = (item: DeletedItem) => {
    Alert.alert(
      'Restore Item',
      `Restore "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              const endpoint = item.type === 'folder' 
                ? `/folders/${item.id}/restore/`
                : `/images/${item.id}/restore/`;
              
              await AxiosInstance.post(endpoint);
              Alert.alert('Success', `${item.type === 'folder' ? 'Folder' : 'Image'} restored successfully`);
              loadDeletedItems();
            } catch (error) {
              console.error(error);
              Alert.alert('Error', 'Failed to restore item');
            }
          },
        },
      ]
    );
  };

  const handlePermanentDelete = (item: DeletedItem) => {
    Alert.alert(
      'Permanently Delete',
      `Permanently delete "${item.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const endpoint = item.type === 'folder'
                ? `/folders/${item.id}/permanent/`
                : `/images/${item.id}/permanent/`;
              
              await AxiosInstance.delete(endpoint);
              Alert.alert('Success', 'Item permanently deleted');
              loadDeletedItems();
            } catch (error) {
              console.error(error);
              Alert.alert('Error', 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  const handleEmptyTrash = () => {
    if (items.length === 0) return;

    Alert.alert(
      'Empty Trash',
      `Permanently delete all ${items.length} items? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Empty Trash',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(
                items.map((item) => {
                  const endpoint = item.type === 'folder'
                    ? `/folders/${item.id}/permanent/`
                    : `/images/${item.id}/permanent/`;
                  return AxiosInstance.delete(endpoint);
                })
              );
              Alert.alert('Success', 'All items permanently deleted');
              loadDeletedItems();
            } catch (error) {
              console.error(error);
              Alert.alert('Error', 'Failed to empty trash');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recently Deleted</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleEmptyTrash}>
            <Text style={styles.emptyTrashText}>Empty</Text>
          </TouchableOpacity>
        )}
        {items.length === 0 && <View style={styles.placeholder} />}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DC143C" />}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trash-outline" size={52} color="#E5E5EA" />
            <Text style={styles.emptyText}>No Recently Deleted Items</Text>
            <Text style={styles.emptySubtext}>Deleted items will appear here</Text>
          </View>
        ) : (
          <>
            <Text style={styles.infoText}>
              Items in Recently Deleted will remain for 30 days before being permanently removed.
            </Text>
            {items.map((item) => (
              <View key={`${item.type}-${item.id}`} style={styles.item}>
                {item.type === 'folder' ? (
                  <View style={styles.iconWrap}>
                    <Ionicons name="folder" size={20} color="#DC143C" />
                  </View>
                ) : (
                  <View style={styles.imageWrap}>
                    {item.image_url ? (
                      <Image 
                        source={{ uri: item.image_url }} 
                        style={styles.thumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="document-text" size={20} color="#DC143C" />
                    )}
                  </View>
                )}

                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {item.type === 'folder' ? 'Folder' : item.folder_name ? `📁 ${item.folder_name}` : 'Image'}
                    {' · Deleted '}
                    {formatTimeAgo(item.deleted_at)}
                  </Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleRestore(item)}
                  >
                    <Ionicons name="arrow-undo" size={20} color="#007AFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handlePermanentDelete(item)}
                  >
                    <Ionicons name="trash" size={20} color="#DC143C" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
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
  emptyTrashText: { fontSize: 16, fontWeight: '600', color: '#DC143C' },
  placeholder: { width: 60 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  loadingText: { textAlign: 'center', color: '#8E8E93', marginTop: 40 },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginTop: 16 },
  emptySubtext: { fontSize: 13, color: '#8E8E93', marginTop: 4 },
  infoText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    marginBottom: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFE8EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  imageWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F8F8F8',
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
  itemTitle: { fontSize: 15, fontWeight: '500', color: '#1A1A1A', marginBottom: 2 },
  itemSub: { fontSize: 12, color: '#8E8E93' },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
});
