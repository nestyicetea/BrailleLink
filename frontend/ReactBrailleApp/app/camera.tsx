import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Modal, TextInput, ScrollView, Dimensions, Animated, FlatList
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AxiosInstance from '../axios';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';

const { width, height } = Dimensions.get('window');
const DEFAULT_FOLDER_KEY = 'default_folder_id';
const TRANSLATED_TEXT = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent interdum, nisl nec facilisis ullamcorper, risus nunc fermentum nisl, vel vestibulum nisl nisl nec nisl. Nullam euismod, nisl eget aliquam ultricies, nunc nisl aliquet nunc, quis aliquam nisl nisl quis nisl.

Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.`;

export default function CameraScreen() {
  const cameraRef = useRef<any>(null);
  const flatListRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [imageName, setImageName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [saveType, setSaveType] = useState<'image' | 'text'>('image');

  const scanAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    requestPermission();
    loadFolders();
    loadDefaultFolder();
  }, []);

  const loadDefaultFolder = async () => {
    try {
      const saved = await AsyncStorage.getItem(DEFAULT_FOLDER_KEY);
      if (saved) setDefaultFolderId(Number(saved));
    } catch (e) {
      console.error('Failed to load default folder', e);
    }
  };

  const saveDefaultFolder = async (folderId: number | null) => {
    try {
      if (folderId) {
        await AsyncStorage.setItem(DEFAULT_FOLDER_KEY, folderId.toString());
      } else {
        await AsyncStorage.removeItem(DEFAULT_FOLDER_KEY);
      }
      setDefaultFolderId(folderId);
    } catch (e) {
      console.error('Failed to save default folder', e);
    }
  };

  const startScanAnimation = () => {
    setIsScanning(true);
    scanAnimation.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnimation, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanAnimation, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopScanAnimation = () => {
    setIsScanning(false);
    scanAnimation.stopAnimation();
  };

  const loadFolders = async () => {
    try {
      const response = await AxiosInstance.get('/folders/');
      if (response.data && response.data.folders) {
        setFolders(response.data.folders);
      }
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  };

  const uploadToBackend = async (
    imageUri: string,
    folderId: number | null,
    name?: string
  ) => {
    setUploading(true);
    try {
      const formData = new FormData();
      if (folderId) formData.append('folder', folderId.toString());

      const filename = imageUri.split('/').pop() || '';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('image', { uri: imageUri, name: `captured_${Date.now()}.jpg`, type } as any);
      formData.append('image_name', name || `Capture_${new Date().toLocaleString()}`);

      const response = await AxiosInstance.post('/images/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      return response.data && response.data.status === 'success';
    } catch (error) {
      console.error('Upload error:', error);
      return false;
    } finally {
      setUploading(false);
    }
  };

  const saveTextAsFile = async (text: string, fileName: string, folderId: number | null) => {
    setUploading(true);
    try {
      // Create form data for text file
      const formData = new FormData();
      if (folderId) formData.append('folder', folderId.toString());
      
      // Create a blob from the text
      const blob = new Blob([text], { type: 'text/plain' });
      
      // In React Native, we can append the blob directly with a filename using this approach
      formData.append('image', {
        uri: 'data:text/plain;base64,' + await blobToBase64(blob),
        name: `${fileName}.txt`,
        type: 'text/plain',
      } as any);
      
      formData.append('image_name', fileName);
      
      console.log('Uploading text file:', fileName);
      const response = await AxiosInstance.post('/images/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      console.log('Upload response:', response.data);
      return response.data && response.data.status === 'success';
    } catch (error) {
      console.error('Text save error:', error);
      return false;
    } finally {
      setUploading(false);
    }
  };
  
  // Helper function to convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleCapture = (uri: string) => {
    setImage(uri);
    setPendingImageUri(uri);
    setPendingText(null);
    setShowButtons(false);
    setCurrentIndex(0);
    startScanAnimation();
    setTimeout(() => {
      stopScanAnimation();
      setShowButtons(true);
    }, 2000);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        handleCapture(photo.uri);
      } catch (error) {
        Alert.alert('Error', 'Failed to take picture');
      }
    }
  };

  const toggleFlash = () => {
    if (flashMode === 'off') {
      setFlashMode('on');
    } else if (flashMode === 'on') {
      setFlashMode('auto');
    } else {
      setFlashMode('off');
    }
  };

  const getFlashIcon = () => {
    if (flashMode === 'off') return 'flash-off-outline';
    if (flashMode === 'on') return 'flash-outline';
    return 'flash-outline';
  };

  const getFlashColor = () => {
    if (flashMode === 'off') return '#fff';
    return '#FFD700';
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) handleCapture(result.assets[0].uri);
  };

  type Slide =
    | { id: number; source: any; uri: string; label: string; isLocal: false; type: 'image' }
    | { id: number; text: string; label: string; isLocal: true; type: 'text' };

  const slides: Slide[] = image
    ? [
        { id: 1, source: { uri: image }, uri: image, label: 'Original', isLocal: false, type: 'image' },
        { id: 2, text: TRANSLATED_TEXT, label: 'Translated', isLocal: true, type: 'text' },
      ]
    : [];

  const handleSavePress = () => {
    const currentSlide = slides[currentIndex];
    const name = `${currentSlide.label}_${Date.now()}`;
    setImageName(name);
    setSelectedFolder(defaultFolderId);
    
    if (currentSlide.type === 'text') {
      setSaveType('text');
      setPendingText(currentSlide.text ?? null);
      setShowSaveModal(true);
    } else {
      setSaveType('image');
      setPendingImageUri(currentSlide.uri ?? null);
      setShowSaveModal(true);
    }
  };

  const handleConfirmSave = async () => {
    if (saveType === 'text' && pendingText) {
      const success = await saveTextAsFile(pendingText, imageName, selectedFolder);
      if (success) {
        setShowSaveModal(false);
        Alert.alert('Success', 'Text file saved successfully!');
      } else {
        Alert.alert('Error', 'Failed to save text file. Please try again.');
      }
    } else if (saveType === 'image' && pendingImageUri) {
      const success = await uploadToBackend(pendingImageUri, selectedFolder, imageName);
      if (success) {
        setShowSaveModal(false);
        Alert.alert('Success', 'Photo saved successfully!');
      } else {
        Alert.alert('Error', 'Failed to save photo. Please try again.');
      }
    } else {
      Alert.alert('Info', 'No content to save.');
    }
  };

  const handleRetake = () => {
    setImage(null);
    setPendingImageUri(null);
    setPendingText(null);
    setShowButtons(false);
    setShowSaveModal(false);
    setCurrentIndex(0);
    stopScanAnimation();
  };

  const createNewFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }
    try {
      const response = await AxiosInstance.post('/folders/', { folder_name: newFolderName });
      if (response.data && response.data.folder_id) {
        const newFolder = { folder_id: response.data.folder_id, folder_name: newFolderName };
        setFolders(prev => [...prev, newFolder]);
        setSelectedFolder(response.data.folder_id);
        setNewFolderName('');
        Alert.alert('Success', 'Folder created');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.slideContainer}>
      {item.type === 'image' ? (
        <Image source={item.source} style={styles.fullImage} resizeMode="cover" />
      ) : (
        <View style={styles.textContainer}>
          <ScrollView contentContainerStyle={styles.textScrollContent}>
            <Text style={styles.translatedText}>{item.text}</Text>
          </ScrollView>
        </View>
      )}
    </View>
  );

  const onScroll = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (image) {
    return (
      <View style={styles.previewContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Camera</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Scanning phase OR Carousel phase — never both */}
        {isScanning ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: image }} style={styles.fullImagePreview} resizeMode="cover" />
            <View style={styles.scanningOverlay}>
              <Animated.View style={[styles.scanLine, {
                transform: [{
                  translateY: scanAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-height / 2.5, height / 2.5],
                  })
                }]
              }]} />
              <Text style={styles.scanningText}>Scanning document...</Text>
            </View>
          </View>
        ) : showButtons ? (
          <View style={styles.carouselWrapper}>
            <FlatList
              ref={flatListRef}
              data={slides}
              renderItem={renderItem}
              keyExtractor={(item) => item.id.toString()}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              style={{ flex: 1 }}
            />

            {/* Label + Counter */}
            <View style={styles.counterContainer}>
              <Text style={styles.counterText}>
                {slides[currentIndex]?.label}{'  '}{currentIndex + 1} / {slides.length}
              </Text>
            </View>

            {/* Save & Retake */}
            <View style={styles.twoButtonsContainer}>
              <TouchableOpacity style={styles.saveButtonLarge} onPress={handleSavePress}>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={[styles.buttonLargeText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.retakeButtonLarge} onPress={handleRetake}>
                <Ionicons name="camera-outline" size={18} color="#E53935" />
                <Text style={styles.buttonLargeText}>Retake</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Save Modal */}
        <Modal
          visible={showSaveModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowSaveModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {saveType === 'text' ? 'Save Text File' : 'Save Image'}
                </Text>
                <TouchableOpacity onPress={() => setShowSaveModal(false)}>
                  <Ionicons name="close" size={24} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              {/* File Name */}
              <View style={styles.inputWithIcon}>
                <Text style={styles.inputLabel}>
                  {saveType === 'text' ? 'File Name' : 'Image Name'}
                </Text>
                <TouchableOpacity onPress={() => setImageName('')} style={styles.editIcon}>
                  <Ionicons name="create-outline" size={20} color="#DC143C" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder={saveType === 'text' ? "Enter file name" : "Enter image name"}
                placeholderTextColor="#C7C7CC"
                value={imageName}
                onChangeText={setImageName}
              />
              {saveType === 'text' && (
                <Text style={styles.fileExtensionHint}>.txt will be added automatically</Text>
              )}

              {/* Folder List */}
              <Text style={[styles.inputLabel, { marginTop: 12, marginBottom: 8 }]}>
                Select Folder
              </Text>
              <ScrollView style={styles.folderList} showsVerticalScrollIndicator={false}>
                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.folder_id}
                    style={[
                      styles.folderOption,
                      selectedFolder === folder.folder_id && styles.folderOptionSelected,
                    ]}
                    onPress={() => setSelectedFolder(folder.folder_id)}
                  >
                    <View style={styles.folderLeft}>
                      <Text style={styles.folderIcon}>📁</Text>
                      <Text style={styles.folderName}>{folder.folder_name}</Text>
                    </View>
                    <View style={styles.folderRight}>
                      {selectedFolder === folder.folder_id && (
                        <Ionicons name="checkmark" size={18} color="#DC143C" />
                      )}
                      <TouchableOpacity
                        onPress={() => saveDefaultFolder(folder.folder_id)}
                        style={styles.starButton}
                      >
                        <Ionicons
                          name={defaultFolderId === folder.folder_id ? 'star' : 'star-outline'}
                          size={20}
                          color={defaultFolderId === folder.folder_id ? '#FFD700' : '#C7C7CC'}
                        />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Default folder hint */}
              {defaultFolderId ? (
                <View style={styles.defaultInfo}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={styles.defaultInfoText}>
                    Default: {folders.find(f => f.folder_id === defaultFolderId)?.folder_name ?? ''}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowSaveModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleConfirmSave}
                  disabled={uploading}
                >
                  {uploading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveButtonText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Camera view
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Camera</Text>
        <View style={styles.placeholder} />
      </View>

      <CameraView 
        ref={cameraRef} 
        style={styles.camera} 
        facing="back"
        flash={flashMode}
      />

      <View style={styles.cameraOverlay}>
        <Text style={styles.overlayText}>Position Braille document in frame</Text>
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
          <Ionicons name="images-outline" size={28} color="#fff" />
          <Text style={styles.galleryText}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
          <Ionicons name={getFlashIcon()} size={24} color={getFlashColor()} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingBottom: 5, paddingHorizontal: 20, backgroundColor: '#DC143C',
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  placeholder: { width: 40 },
  placeholderButton: { width: 60 },
  camera: { flex: 1 },
  cameraOverlay: { position: 'absolute', top: 120, width: '100%', alignItems: 'center' },
  overlayText: {
    color: '#fff', fontSize: 14, opacity: 0.8,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  bottomControls: {
    position: 'absolute', bottom: 30, width: '100%',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30,
  },
  galleryButton: { alignItems: 'center' },
  galleryText: { color: '#fff', fontSize: 11, marginTop: 4 },
  captureButton: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  captureButtonInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#fff' },
  flashButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Preview
  previewContainer: { flex: 1, backgroundColor: '#fff' },
  imageContainer: { flex: 1, position: 'relative', backgroundColor: '#000' },
  fullImagePreview: {
    width: width - 20, height: height * 0.6,
    alignSelf: 'center', marginTop: 10, borderRadius: 8,
  },

  // Carousel wrapper — replaces imageContainer after scan
  carouselWrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  slideContainer: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: width - 20,
    height: height * 0.7,
    borderRadius: 8,
  },
  textContainer: {
    width: width - 40,
    height: height * 0.7,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  textScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  translatedText: {
    fontSize: 24,
    color: '#333',
    textAlign: 'center',
  },
  counterContainer: {
    alignSelf: 'center',
    marginVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  counterText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  twoButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 5, paddingBottom: 30, paddingTop: 10, gap: 16, marginHorizontal: 5,
  },
  saveButtonLarge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#DC143C', paddingVertical: 14, borderRadius: 8, gap: 6,
  },
  retakeButtonLarge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#E53935',
    paddingVertical: 14, borderRadius: 8, gap: 6,
  },
  buttonLargeText: { color: '#333', fontSize: 13, fontWeight: '500' },

  // Scanning
  scanningOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
  },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#DC143C', width: '100%' },
  scanningText: { color: '#fff', fontSize: 16, marginTop: 20, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, width: '90%', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 12 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  editIcon: { padding: 4 },
  modalInput: { borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 10, padding: 12, fontSize: 16, color: '#1A1A1A' },
  fileExtensionHint: { fontSize: 12, color: '#8E8E93', marginTop: 4, marginLeft: 4 },
  folderList: { maxHeight: 250, marginTop: 8 },
  folderOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  folderOptionSelected: { backgroundColor: '#F8F8F8' },
  folderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  folderIcon: { fontSize: 20 },
  folderName: { fontSize: 15, color: '#1A1A1A' },
  folderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  starButton: { padding: 4 },
  defaultInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, padding: 8, backgroundColor: '#FDF5E6', borderRadius: 8 },
  defaultInfoText: { fontSize: 12, color: '#8E8E93' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  cancelButton: { backgroundColor: '#F5F5F5' },
  cancelButtonText: { color: '#8E8E93', fontSize: 16, fontWeight: '500' },
  saveButton: { backgroundColor: '#DC143C' },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  message: { color: '#fff', fontSize: 16, textAlign: 'center', marginTop: 50 },
  permissionButton: { backgroundColor: '#DC143C', padding: 15, borderRadius: 10, margin: 20, alignItems: 'center' },
  permissionButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});