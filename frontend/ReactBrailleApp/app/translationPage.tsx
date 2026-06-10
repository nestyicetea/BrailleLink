import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Dimensions, Alert, Modal, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AxiosInstance from '../axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function TranslationPage() {
  const slideAnim = useRef(new Animated.Value(width)).current;
  const { imageUri } = useLocalSearchParams();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [imageName, setImageName] = useState('');
  const [defaultFolderId, setDefaultFolderId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Generate default image name
  const generateDefaultImageName = () => {
    const now = new Date();
    return `Braille_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    loadFolders();
    loadDefaultFolder();
  }, []);

  const loadFolders = async () => {
    try {
      const response = await AxiosInstance.get('/folders/');
      if (response.data && response.data.folders) {
        setFolders(response.data.folders);
        // Set first folder as selected if none selected
        if (response.data.folders.length > 0 && !selectedFolder) {
          setSelectedFolder(response.data.folders[0].folder_id);
        }
      }
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  };

  const loadDefaultFolder = async () => {
    try {
      const savedDefaultId = await AsyncStorage.getItem('translationDefaultFolderId');
      if (savedDefaultId) {
        setDefaultFolderId(parseInt(savedDefaultId));
        setSelectedFolder(parseInt(savedDefaultId));
      }
    } catch (error) {
      console.error('Error loading default folder:', error);
    }
  };

  const saveDefaultFolder = async (folderId: number) => {
    try {
      await AsyncStorage.setItem('translationDefaultFolderId', folderId.toString());
      setDefaultFolderId(folderId);
      Alert.alert('Success', 'Default folder set');
    } catch (error) {
      console.error('Error saving default folder:', error);
    }
  };

  const handleSaveImage = async () => {
    if (!selectedFolder) {
      Alert.alert('Error', 'Please select a folder');
      return;
    }
    
    if (!imageName.trim()) {
      Alert.alert('Error', 'Please enter an image name');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('folder', selectedFolder.toString());
      formData.append('image_name', imageName);
      
      // Use the actual image URI passed from camera screen
      const actualImageUri = imageUri || require('../assets/images/sample.jpeg');
      
      formData.append('image', {
        uri: typeof actualImageUri === 'string' ? actualImageUri : actualImageUri.uri,
        name: `${imageName}.jpg`,
        type: 'image/jpeg',
      } as any);

      const uploadResponse = await AxiosInstance.post('/images/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (uploadResponse.data && uploadResponse.data.status === 'success') {
        Alert.alert('Success', `Image "${imageName}" saved successfully!`, [
          { text: 'OK', onPress: () => {
            setShowSaveModal(false);
            setImageName(generateDefaultImageName());
          }}
        ]);
      } else {
        Alert.alert('Error', uploadResponse.data?.errors || 'Failed to save image');
      }
    } catch (error: any) {
      console.error('Error saving image:', error);
      Alert.alert('Error', error?.response?.data?.errors || 'Failed to save image');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    Animated.timing(slideAnim, {
      toValue: width,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      router.back();
    });
  };

  const handleSaved = () => {
    // Refresh default name when opening modal
    setImageName(generateDefaultImageName());
    setShowSaveModal(true);
  };

  const handleSetDefaultFolder = (folderId: number) => {
    saveDefaultFolder(folderId);
    setSelectedFolder(folderId);
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Braille Translation</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Portrait Image */}
      <View style={styles.imageContainer}>
        <Image
          source={require('../assets/images/sample.jpeg')}
          style={styles.portraitImage}
          resizeMode="contain"
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity style={styles.savedButton} onPress={handleSaved}>
        <Text style={styles.savedButtonText}>Save to Gallery</Text>
      </TouchableOpacity>

      {/* Save Modal */}
      <Modal visible={showSaveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Save Image</Text>
              <TouchableOpacity onPress={() => {
                setShowSaveModal(false);
              }}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {/* Image Name Input with pre-filled value */}
            <Text style={styles.inputLabel}>Image Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter image name"
              placeholderTextColor="#C7C7CC"
              value={imageName}
              onChangeText={setImageName}
            />

            {/* Folder Selection */}
            <Text style={styles.inputLabel}>Select Folder</Text>
            <ScrollView style={styles.folderList} showsVerticalScrollIndicator={false}>
              {folders.map((folder) => (
                <TouchableOpacity
                  key={folder.folder_id}
                  style={[
                    styles.folderOption,
                    selectedFolder === folder.folder_id && styles.folderOptionSelected
                  ]}
                  onPress={() => setSelectedFolder(folder.folder_id)}
                >
                  <View style={styles.folderLeft}>
                    <Text style={styles.folderIcon}>📁</Text>
                    <Text style={styles.folderName}>{folder.folder_name}</Text>
                  </View>
                  <View style={styles.folderRight}>
                    <TouchableOpacity 
                      onPress={() => handleSetDefaultFolder(folder.folder_id)}
                      style={styles.starButton}
                    >
                      <Ionicons 
                        name={defaultFolderId === folder.folder_id ? "star" : "star-outline"} 
                        size={20} 
                        color={defaultFolderId === folder.folder_id ? "#FFD700" : "#C7C7CC"} 
                      />
                    </TouchableOpacity>
                    {selectedFolder === folder.folder_id && (
                      <Ionicons name="checkmark-circle" size={20} color="#DC143C" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Default Folder Info */}
            {defaultFolderId && (
              <View style={styles.defaultInfo}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={styles.defaultInfoText}>
                  Default: {folders.find(f => f.folder_id === defaultFolderId)?.folder_name}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => {
                  setShowSaveModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]} 
                onPress={handleSaveImage}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#DC143C',
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
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  imageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  portraitImage: {
    width: width - 40,
    height: height * 0.6,
    borderRadius: 12,
  },
  savedButton: {
    width: width - 40,
    alignSelf: 'center',
    paddingVertical: 14,
    marginBottom: 30,
    marginTop: 20,
    backgroundColor: '#DC143C',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
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
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1A1A1A',
  },
  folderList: {
    maxHeight: 250,
    marginTop: 8,
  },
  folderOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  folderOptionSelected: {
    backgroundColor: '#F8F8F8',
  },
  folderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  folderIcon: {
    fontSize: 20,
  },
  folderName: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  folderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  starButton: {
    padding: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
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
  saveButton: {
    backgroundColor: '#DC143C',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  defaultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: '#FDF5E6',
    borderRadius: 8,
  },
  defaultInfoText: {
    fontSize: 12,
    color: '#8E8E93',
  },
});