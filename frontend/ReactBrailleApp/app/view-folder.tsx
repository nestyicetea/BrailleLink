import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Image, Alert, Modal, TextInput } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';

const { width, height } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 3;

interface ImageItem {
  image_id: number;
  folder: number;
  image_path: string;
  image_name: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
  is_text?: boolean;
  text_content?: string;
}

export default function ViewFolderScreen() {
  const { folderId, folderName } = useLocalSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderInfo, setFolderInfo] = useState<any>(null);
  const [selectedImages, setSelectedImages] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ImageItem | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingItem, setRenamingItem] = useState<ImageItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [isTextViewModal, setIsTextViewModal] = useState(false);

  useEffect(() => {
    loadFolderContents();
  }, []);

  const loadFolderContents = async () => {
    try {
      const response = await AxiosInstance.get(`/folders/${folderId}/`);
      if (response.data) {
        setFolderInfo({
          folder_id: response.data.folder_id,
          folder_name: response.data.folder_name,
          created_at: response.data.created_at,
          updated_at: response.data.updated_at,
        });
        setImages(response.data.images || []);
      }
    } catch (error) {
      console.error('Error loading folder contents:', error);
      Alert.alert('Error', 'Failed to load folder contents');
    } finally {
      setLoading(false);
    }
  };

  const fetchTextContent = async (item: ImageItem) => {
    if (!item.image_url) return null;
    try {
      const response = await AxiosInstance.get(item.image_url, {
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching text content:', error);
      return null;
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFolderContents();
    setRefreshing(false);
  }, []);

  const handleItemPress = async (item: ImageItem) => {
    if (isSelectionMode) {
      toggleSelection(item.image_id);
      return;
    }

    setSelectedItem(item);
    setIsTextViewModal(false);
    setShowViewModal(true);

    if (item.is_text) {
      const content = await fetchTextContent(item);
      if (content) {
        setSelectedItem({ ...item, text_content: content });
        setIsTextViewModal(true);
      } else {
        Alert.alert('Error', 'Failed to load text content');
        setShowViewModal(false);
      }
    }
  };

  const handleLongPress = (item: ImageItem) => {
    setIsSelectionMode(true);
    toggleSelection(item.image_id);
  };

  const toggleSelection = (imageId: number) => {
    if (selectedImages.includes(imageId)) {
      setSelectedImages(selectedImages.filter(id => id !== imageId));
      if (selectedImages.length === 1) {
        setIsSelectionMode(false);
      }
    } else {
      setSelectedImages([...selectedImages, imageId]);
    }
  };

  const handleDeleteSelected = () => {
    Alert.alert(
      'Delete Items',
      `Are you sure you want to delete ${selectedImages.length} item(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const imageId of selectedImages) {
                await AxiosInstance.delete(`/images/${imageId}/`);
              }
              setImages(images.filter(img => !selectedImages.includes(img.image_id)));
              setSelectedImages([]);
              setIsSelectionMode(false);
              Alert.alert('Success', `${selectedImages.length} item(s) deleted successfully`);
            } catch (error) {
              console.error('Error deleting items:', error);
              Alert.alert('Error', 'Failed to delete some items');
            }
          }
        }
      ]
    );
  };

  const handleCopySelected = async () => {
    Alert.alert('Copy', 'Copy feature coming soon!');
  };

  const handleRenameItem = async () => {
    if (!renamingItem || !newItemName.trim()) return;
    
    try {
      const response = await AxiosInstance.patch(`/images/${renamingItem.image_id}/`, {
        image_name: newItemName.trim()
      });
      if (response.data) {
        setImages(images.map(img => 
          img.image_id === renamingItem.image_id 
            ? { ...img, image_name: newItemName.trim() }
            : img
        ));
        Alert.alert('Success', 'Item renamed successfully');
        setShowRenameModal(false);
        setRenamingItem(null);
        setNewItemName('');
      }
    } catch (error) {
      console.error('Error renaming item:', error);
      Alert.alert('Error', 'Failed to rename item');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const renderItem = (item: ImageItem) => {
    const isSelected = selectedImages.includes(item.image_id);
    
    return (
      <TouchableOpacity
        key={item.image_id}
        style={[styles.gridItem, isSelected && styles.selectedItem]}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.imageContainer}>
          {item.is_text ? (
            <View style={styles.textFileContainer}>
              <Ionicons name="document-text-outline" size={40} color="#DC143C" />
              <Text style={styles.textFileLabel}>TXT</Text>
            </View>
          ) : item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.thumbnail} />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderIcon}>🖼️</Text>
            </View>
          )}
          {isSelected && (
            <View style={styles.checkmarkOverlay}>
              <Ionicons name="checkmark-circle" size={24} color="#DC143C" />
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => {
          setRenamingItem(item);
          setNewItemName(item.image_name || '');
          setShowRenameModal(true);
        }}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.image_name || 'Unnamed'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
        {item.is_text && (
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>TXT</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderGrid = () => {
    const rows = [];
    for (let i = 0; i < images.length; i += 3) {
      const rowItems = images.slice(i, i + 3);
      rows.push(
        <View key={i} style={styles.row}>
          {rowItems.map(renderItem)}
          {rowItems.length < 3 && Array(3 - rowItems.length).fill(null).map((_, idx) => (
            <View key={`empty-${idx}`} style={styles.gridItem} />
          ))}
        </View>
      );
    }
    return rows;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading contents...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{folderName || 'Folder'}</Text>
        {isSelectionMode ? (
          <TouchableOpacity onPress={() => {
            setIsSelectionMode(false);
            setSelectedImages([]);
          }} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {/* Stats Bar with Selection Actions */}
      <View style={styles.statsBar}>
        {isSelectionMode ? (
          <View style={styles.selectionActions}>
            <Text style={styles.statsText}>{selectedImages.length} selected</Text>
            <View style={styles.selectionButtons}>
              <TouchableOpacity onPress={handleCopySelected} style={styles.selectionActionBtn}>
                <Ionicons name="copy-outline" size={20} color="#DC143C" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteSelected} style={styles.selectionActionBtn}>
                <Ionicons name="trash-outline" size={20} color="#DC143C" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.statsText}>{images.length} items</Text>
            <Text style={styles.statsDate}>Created: {formatDate(folderInfo?.created_at)}</Text>
          </>
        )}
      </View>

      {/* Grid */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#DC143C']}
            tintColor="#DC143C"
          />
        }
      >
        {images.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No items in this folder</Text>
            <TouchableOpacity 
              style={styles.emptyButton} 
              onPress={() => router.push('/camera')}
            >
              <Text style={styles.emptyButtonText}>Add Items</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {renderGrid()}
          </View>
        )}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* View Modal - Full screen for both images and text */}
      <Modal visible={showViewModal} transparent animationType="none" onRequestClose={() => setShowViewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowViewModal(false)}>
              <Ionicons name="close" size={30} color="#1A1A1A" />
            </TouchableOpacity>

            {/* File Name at top */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {selectedItem?.image_name || 'Unnamed'}
                {selectedItem?.is_text ? '.txt' : ''}
              </Text>
            </View>
            
            {isTextViewModal && selectedItem?.text_content ? (
              // Full screen text view
              <View style={styles.fullScreenTextView}>
                <ScrollView 
                  style={styles.fullScreenTextScroll} 
                  contentContainerStyle={styles.fullScreenTextContent}
                  showsVerticalScrollIndicator={true}
                  indicatorStyle="black"
                >
                  <Text style={styles.fullScreenText}>{selectedItem.text_content}</Text>
                </ScrollView>
              </View>
            ) : selectedItem?.image_url && !selectedItem.is_text ? (
              // Full screen image view
              <View style={styles.fullScreenImageView}>
                <Image 
                  source={{ uri: selectedItem.image_url }} 
                  style={styles.fullScreenImage} 
                  resizeMode="contain" 
                />
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={showRenameModal} transparent animationType="none" onRequestClose={() => setShowRenameModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.renameModalContent}>
            <View style={styles.renameModalHeader}>
              <Text style={styles.renameModalTitle}>Rename Item</Text>
              <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.renameInput}
              placeholder="Enter new name"
              placeholderTextColor="#C7C7CC"
              value={newItemName}
              onChangeText={setNewItemName}
              autoFocus
            />
            <View style={styles.renameButtons}>
              <TouchableOpacity style={styles.renameCancelBtn} onPress={() => setShowRenameModal(false)}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameSaveBtn} onPress={handleRenameItem}>
                <Text style={styles.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  placeholder: {
    width: 40,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelButtonText: {
    color: '#DC143C',
    fontSize: 14,
    fontWeight: '500',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8F8F8',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  statsText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  statsDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  selectionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  selectionButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  selectionActionBtn: {
    padding: 4,
  },
  gridContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  gridItem: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
    position: 'relative',
  },
  selectedItem: {
    opacity: 0.8,
  },
  imageContainer: {
    position: 'relative',
    width: COLUMN_WIDTH - 8,
    height: COLUMN_WIDTH - 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8F8F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 34,
    opacity: 0.5,
  },
  textFileContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F0F0',
  },
  textFileLabel: {
    fontSize: 10,
    color: '#DC143C',
    fontWeight: 'bold',
    marginTop: 2,
  },
  checkmarkOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  itemDate: {
    fontSize: 10,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
  },
  fileTypeBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#DC143C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileTypeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 60,
    opacity: 0.3,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 20,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#DC143C',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomSpacing: {
    height: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 80,
    zIndex: 10,
  },
  modalHeaderTitle: {
    color: '#1A1A1A', 
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.9,
  },
  fullScreenImageView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 40,
  },
  fullScreenImage: {
    width: width,
    height: height * 0.8,
  },
  fullScreenTextView: {
    flex: 1,
    paddingTop: 110,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  fullScreenTextScroll: {
    flex: 1,
  },
  fullScreenTextContent: {
    paddingVertical: 10,
  },
  fullScreenText: {
    fontSize: 16,
    color: '#1A1A1A',
    fontFamily: 'monospace',
    lineHeight: 26,
  },
  renameModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '85%',
  },
  renameModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  renameModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  renameInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1A1A1A',
    marginBottom: 20,
  },
  renameButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  renameCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  renameCancelText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '500',
  },
  renameSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#DC143C',
  },
  renameSaveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});