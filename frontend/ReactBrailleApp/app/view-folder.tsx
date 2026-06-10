import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Image, Alert, Modal, TextInput } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 3;

interface ImageItem {
  image_id: number;
  folder: number;
  image_path: string;
  image_name: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
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
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingImage, setRenamingImage] = useState<ImageItem | null>(null);
  const [newImageName, setNewImageName] = useState('');

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
        
        const imagesList = response.data.images || [];
        // Build full image URLs
        const imagesWithUrls = imagesList.map((img: any) => ({
          ...img,
          image_url: img.image_path ? `http://192.168.254.100:8000${img.image_path}` : null
        }));
        setImages(imagesWithUrls);
      }
    } catch (error) {
      console.error('Error loading folder contents:', error);
      Alert.alert('Error', 'Failed to load folder contents');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFolderContents();
    setRefreshing(false);
  }, []);

  const handleImagePress = (image: ImageItem) => {
    if (isSelectionMode) {
      toggleSelection(image.image_id);
    } else {
      setSelectedImage(image);
      setShowViewModal(true);
    }
  };

  const handleLongPress = (image: ImageItem) => {
    setIsSelectionMode(true);
    toggleSelection(image.image_id);
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
      'Delete Images',
      `Are you sure you want to delete ${selectedImages.length} image(s)?`,
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
              Alert.alert('Success', `${selectedImages.length} image(s) deleted successfully`);
            } catch (error) {
              console.error('Error deleting images:', error);
              Alert.alert('Error', 'Failed to delete some images');
            }
          }
        }
      ]
    );
  };

  const handleCopySelected = async () => {
    Alert.alert('Copy', 'Copy feature coming soon!');
  };

  const handleRenameImage = async () => {
    if (!renamingImage || !newImageName.trim()) return;
    
    try {
      const response = await AxiosInstance.patch(`/images/${renamingImage.image_id}/`, {
        image_name: newImageName.trim()
      });
      if (response.data) {
        setImages(images.map(img => 
          img.image_id === renamingImage.image_id 
            ? { ...img, image_name: newImageName.trim() }
            : img
        ));
        Alert.alert('Success', 'Image renamed successfully');
        setShowRenameModal(false);
        setRenamingImage(null);
        setNewImageName('');
      }
    } catch (error) {
      console.error('Error renaming image:', error);
      Alert.alert('Error', 'Failed to rename image');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const renderImageItem = (item: ImageItem) => {
    const isSelected = selectedImages.includes(item.image_id);
    
    return (
      <TouchableOpacity
        key={item.image_id}
        style={[styles.gridItem, isSelected && styles.selectedItem]}
        onPress={() => handleImagePress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.imageContainer}>
          {item.image_url ? (
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
          setRenamingImage(item);
          setNewImageName(item.image_name || '');
          setShowRenameModal(true);
        }}>
          <Text style={styles.imageName} numberOfLines={1}>
            {item.image_name || 'Unnamed'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.imageDate}>{formatDate(item.created_at)}</Text>
      </TouchableOpacity>
    );
  };

  const renderGrid = () => {
    const rows = [];
    for (let i = 0; i < images.length; i += 3) {
      const rowItems = images.slice(i, i + 3);
      rows.push(
        <View key={i} style={styles.row}>
          {rowItems.map(renderImageItem)}
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
        <Text style={styles.loadingText}>Loading images...</Text>
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
            <Text style={styles.statsText}>{images.length} images</Text>
            <Text style={styles.statsDate}>Created: {formatDate(folderInfo?.created_at)}</Text>
          </>
        )}
      </View>

      {/* Image Grid */}
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
            <Text style={styles.emptyText}>No images in this folder</Text>
            <TouchableOpacity 
              style={styles.emptyButton} 
              onPress={() => router.push('/camera')}
            >
              <Text style={styles.emptyButtonText}>Add Images</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {renderGrid()}
          </View>
        )}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Image View Modal */}
      <Modal visible={showViewModal} transparent animationType="none" onRequestClose={() => setShowViewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowViewModal(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {selectedImage && selectedImage.image_url && (
              <Image source={{ uri: selectedImage.image_url }} style={styles.fullImageModal} resizeMode="contain" />
            )}
            <Text style={styles.modalImageName}>{selectedImage?.image_name || 'Unnamed'}</Text>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={showRenameModal} transparent animationType="none" onRequestClose={() => setShowRenameModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.renameModalContent}>
            <View style={styles.renameModalHeader}>
              <Text style={styles.renameModalTitle}>Rename Image</Text>
              <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.renameInput}
              placeholder="Enter new name"
              placeholderTextColor="#C7C7CC"
              value={newImageName}
              onChangeText={setNewImageName}
              autoFocus
            />
            <View style={styles.renameButtons}>
              <TouchableOpacity style={styles.renameCancelBtn} onPress={() => setShowRenameModal(false)}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameSaveBtn} onPress={handleRenameImage}>
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
  checkmarkOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
  },
  imageName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  imageDate: {
    fontSize: 10,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
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
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  fullImageModal: {
    width: width - 40,
    height: (width - 40) * 1.3,
  },
  modalImageName: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
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