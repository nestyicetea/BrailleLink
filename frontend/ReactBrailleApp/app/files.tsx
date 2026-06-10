import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, TextInput, Alert, Modal } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 3;

interface FileItem {
  folder_id: number;
  folder_name: string;
  image_count?: number;
  created_at?: string;
  updated_at?: string;
}

export default function FilesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const response = await AxiosInstance.get('/folders/');
      if (response.data && response.data.folders) {
        const folders = response.data.folders.map((folder: any) => ({
          folder_id: folder.folder_id,
          folder_name: folder.folder_name,
          image_count: folder.images ? folder.images.length : 0,
          created_at: folder.created_at,
          updated_at: folder.updated_at,
        }));
        setFiles(folders);
      }
    } catch (error) {
      console.error('Error loading folders:', error);
      Alert.alert('Error', 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFolders();
    setRefreshing(false);
  }, []);

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    setIsCreating(true);
    try {
      const response = await AxiosInstance.post('/folders/', { folder_name: newFolderName });
      if (response.data && response.data.folder_id) {
        const newFolder: FileItem = {
          folder_id: response.data.folder_id,
          folder_name: newFolderName,
          image_count: 0,
          created_at: response.data.created_at,
          updated_at: response.data.updated_at,
        };
        setFiles([newFolder, ...files]);
        setNewFolderName('');
        setModalVisible(false);
        Alert.alert('Success', 'Folder created successfully');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      Alert.alert('Error', 'Failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteFolder = (folderId: number, folderName: string) => {
    Alert.alert(
      'Delete Folder',
      `Are you sure you want to delete "${folderName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await AxiosInstance.delete(`/folders/${folderId}/`);
              setFiles(files.filter(f => f.folder_id !== folderId));
              Alert.alert('Success', 'Folder deleted successfully');
            } catch (error) {
              console.error('Error deleting folder:', error);
              Alert.alert('Error', 'Failed to delete folder');
            }
          }
        }
      ]
    );
  };

  const handleRenamePress = (folder: FileItem) => {
    setRenamingFolder(folder);
    setRenameValue(folder.folder_name);
    setRenameModalVisible(true);
  };

  const handleConfirmRename = async () => {
    if (!renamingFolder) return;
    if (!renameValue.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    setIsRenaming(true);
    try {
      const response = await AxiosInstance.put(`/folders/${renamingFolder.folder_id}/`, { folder_name: renameValue.trim() });
      if (response.data) {
        setFiles(files.map(f => 
          f.folder_id === renamingFolder.folder_id 
            ? { ...f, folder_name: renameValue.trim(), updated_at: response.data.updated_at }
            : f
        ));
        setRenameModalVisible(false);
        setRenamingFolder(null);
        setRenameValue('');
        Alert.alert('Success', 'Folder renamed successfully');
      }
    } catch (error) {
      console.error('Error renaming folder:', error);
      Alert.alert('Error', 'Failed to rename folder');
    } finally {
      setIsRenaming(false);
    }
  };

  const getFilteredAndSortedFiles = () => {
    let filtered = [...files];
    
    if (searchQuery) {
      filtered = filtered.filter(file =>
        file.folder_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    filtered.sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.folder_name.localeCompare(b.folder_name);
      } else {
        return b.folder_name.localeCompare(a.folder_name);
      }
    });
    
    return filtered;
  };

  const renderItem = (item: FileItem) => (
    <TouchableOpacity
      key={item.folder_id}
      style={styles.gridItem}
      onPress={() => router.push({
        pathname: '/view-folder',
        params: { 
          folderId: item.folder_id, 
          folderName: item.folder_name 
        }
      })}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>📁</Text>
        {/* Number badge at top-right - no background color */}
        <Text style={styles.badgeText}>{item.image_count || 0}</Text>
      </View>
      
      {/* Folder Name - Click to Rename */}
      <TouchableOpacity onPress={() => handleRenamePress(item)}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.folder_name}
        </Text>
      </TouchableOpacity>
      
      {/* Item count text below folder name */}
      <Text style={styles.itemCount}>{item.image_count || 0} items</Text>
    </TouchableOpacity>
  );

  const renderAddFolderCard = () => (
    <TouchableOpacity
      key="add-folder"
      style={styles.gridItem}
      onPress={() => setModalVisible(true)}
      activeOpacity={0.7}
    >
      <View style={styles.addIconContainer}>
        <Text style={styles.addIcon}>+</Text>
      </View>
      <Text style={styles.addItemName}>New Folder</Text>
      <Text style={styles.addItemSubtext}>tap to create</Text>
    </TouchableOpacity>
  );

  const renderGrid = () => {
    const filteredFiles = getFilteredAndSortedFiles();
    const rows = [];
    const allItems = [{ isAddButton: true } as any, ...filteredFiles];
    
    for (let i = 0; i < allItems.length; i += 3) {
      const rowItems = allItems.slice(i, i + 3);
      rows.push(
        <View key={i} style={styles.row}>
          {rowItems.map((item) => {
            if (item.isAddButton) {
              return renderAddFolderCard();
            }
            return renderItem(item);
          })}
          {rowItems.length < 3 
            ? Array(3 - rowItems.length).fill(null).map((_, idx) => (
                <View key={`empty-${idx}`} style={styles.gridItem} />
              ))
            : null
          }
        </View>
      );
    }
    return rows;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading folders...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#666666']}
            tintColor="#666666"
          />
        }
      >
        {/* Search & Filter Row */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#C7C7CC"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.filterButton} 
            onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <View style={styles.filterButtonInner}>
              <Ionicons name="swap-vertical-outline" size={18} color="#1A1A1A" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Grid */}
        <View style={styles.gridContainer}>
          {renderGrid()}
        </View>

        {/* Empty State */}
        {getFilteredAndSortedFiles().length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>No folders</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => setModalVisible(true)}>
              <Text style={styles.emptyButtonText}>Create your first folder</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Create Folder Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Folder</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Folder name"
              placeholderTextColor="#C7C7CC"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              onSubmitEditing={handleAddFolder}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => {
                  setModalVisible(false);
                  setNewFolderName('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.createButton]} 
                onPress={handleAddFolder}
                disabled={isCreating}
              >
                <Text style={styles.createButtonText}>
                  {isCreating ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Folder Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Folder</Text>
              <TouchableOpacity onPress={() => setRenameModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Folder name"
              placeholderTextColor="#C7C7CC"
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              onSubmitEditing={handleConfirmRename}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => {
                  setRenameModalVisible(false);
                  setRenamingFolder(null);
                  setRenameValue('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.createButton]} 
                onPress={handleConfirmRename}
                disabled={isRenaming}
              >
                <Text style={styles.createButtonText}>
                  {isRenaming ? 'Saving...' : 'Save'}
                </Text>
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
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingBottom: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 0,
  },
  filterButton: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
  },
  gridContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  gridItem: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
    position: 'relative',
  },
  iconContainer: {
    position: 'relative',
    width: COLUMN_WIDTH - 8,
    height: COLUMN_WIDTH - 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 34,
  },
  badgeText: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#DC143C',
    backgroundColor: 'transparent',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  itemCount: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
  },
  addIconContainer: {
    width: COLUMN_WIDTH - 8,
    height: COLUMN_WIDTH - 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
  },
  addIcon: {
    fontSize: 32,
    color: '#8E8E93',
    fontWeight: '300',
  },
  addItemName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'center',
  },
  addItemSubtext: {
    fontSize: 10,
    color: '#C7C7CC',
    textAlign: 'center',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 60,
    opacity: 0.3,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#C7C7CC',
    marginBottom: 20,
  },
  emptyButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  bottomSpacing: {
    height: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 340,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1A1A1A',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '500',
  },
  createButton: {
    backgroundColor: '#DC143C',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});