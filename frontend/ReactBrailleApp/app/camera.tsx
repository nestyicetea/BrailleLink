import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, Modal, TextInput, ScrollView, Dimensions, Animated, FlatList
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AxiosInstance from '../axios';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { synthesizeSpeech, playWithHighlights, type WordTimestamp } from '../utils/azureTts';

const { width, height } = Dimensions.get('window');
const DEFAULT_FOLDER_KEY = 'default_folder_id';

// Sample outputs shown until the translation model is connected.
const SAMPLE_OUTPUTS = [
  `Maagang dumating ang mga mag-aaral sa silid-aralan upang maghanda para sa kanilang bagong aralin. Ipinaliwanag ng guro na ang bawat pahina ay may mahalagang kuwento at kaalaman na maaaring matutuhan. Sa pamamagitan ng pakikinig at pagtutulungan, naging mas madali para sa lahat ang pag-unawa sa aralin.`,
  `The students arrived early in the classroom and prepared their notebooks for a new lesson. Their teacher explained that every page can offer useful knowledge and encourage careful thinking. By listening to one another and working together, the class found that learning becomes easier and more enjoyable.`,
  `Maagang pumasok ang mga estudyante para maghanda sa kanilang lesson. The teacher reminded them that every page can teach something useful, kaya mahalagang magbasa at mag-isip nang mabuti. Sa pamamagitan ng teamwork and sharing ideas, mas naging madali para sa buong klase ang pagkatuto.`,
];

const getSampleOutput = (photoIndex: number) => SAMPLE_OUTPUTS[photoIndex % SAMPLE_OUTPUTS.length];

export default function CameraScreen() {
  const cameraRef = useRef<any>(null);
  const [kernelSize] = useState(3);
  const flatListRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [batchImageUris, setBatchImageUris] = useState<string[]>([]);
  const [batchProcessedImageUris, setBatchProcessedImageUris] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [imageName, setImageName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isDewarping, setIsDewarping] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [processedImageUri, setProcessedImageUri] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [selectedPhotoIndices, setSelectedPhotoIndices] = useState<number[]>([]);
  const [batchSaveMode, setBatchSaveMode] = useState<'all' | 'selected' | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flashMode, setFlashMode] = useState<'off' | 'torch' | 'auto'>('off');
  const [saveType, setSaveType] = useState<'image' | 'text'>('image');
  const [dewarpProgress, setDewarpProgress] = useState(0);
  const [useApiScanner, setUseApiScanner] = useState(true);
  const [isZooming, setIsZooming] = useState(false);
  const [isReadingAudioEnabled, setIsReadingAudioEnabled] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const ttsCleanupRef = useRef<(() => void) | null>(null);
  const ttsLoadingRef = useRef(false);
  const [preprocessedImageUri, setPreprocessedImageUri] = useState<string | null>(null);
  const [showFilteredResult, setShowFilteredResult] = useState(false);


  const scanAnimation = useRef(new Animated.Value(0)).current;
  const dewarpAnimation = useRef(new Animated.Value(0)).current;
  const zoomAnimation = useRef(new Animated.Value(1)).current;
  const fadeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    requestPermission();
    loadFolders();
    loadDefaultFolder();
  }, []);

  useEffect(() => {
    // Stop any current playback when slide or toggle changes
    if (ttsCleanupRef.current) {
      ttsCleanupRef.current();
      ttsCleanupRef.current = null;
    }
    setActiveWordIndex(-1);

    const isTextSlide = currentIndex % 2 === 1;
    const photoIndex = Math.floor(currentIndex / 2);
    const textToSpeak = isTextSlide ? getSampleOutput(photoIndex) : null;

    if (!isReadingAudioEnabled || !textToSpeak) return;

    let cancelled = false;
    ttsLoadingRef.current = true;

    synthesizeSpeech(textToSpeak)
      .then(({ audioUri, wordTimestamps, totalMs }) => {
        if (cancelled) return;
        playWithHighlights(
          audioUri,
          wordTimestamps,
          totalMs,
          (idx) => { if (!cancelled) setActiveWordIndex(idx); },
          () => { if (!cancelled) setActiveWordIndex(-1); },
          textToSpeak,
        ).then((cleanup) => {
          if (cancelled) { cleanup(); return; }
          ttsCleanupRef.current = cleanup;
        });
      })
      .catch((err) => {
        console.error('Azure TTS error:', err);
      })
      .finally(() => {
        ttsLoadingRef.current = false;
      });

    return () => {
      cancelled = true;
      if (ttsCleanupRef.current) {
        ttsCleanupRef.current();
        ttsCleanupRef.current = null;
      }
      setActiveWordIndex(-1);
    };
  }, [currentIndex, isReadingAudioEnabled]);

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

  const startDewarpAnimation = () => {
    setIsDewarping(true);
    setIsZooming(false);
    dewarpAnimation.setValue(0);
    zoomAnimation.setValue(1.15);
    fadeAnimation.setValue(0);
    
    Animated.parallel([
      Animated.timing(dewarpAnimation, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
      Animated.timing(zoomAnimation, {
        toValue: 1.25,
        duration: 1500,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnimation, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ]).start(() => {
      setShowFilteredResult(true);
      setShowButtons(true);
      setIsDewarping(false);
      setIsZooming(true);
      
      Animated.parallel([
        Animated.timing(zoomAnimation, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnimation, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        })
      ]).start(() => {
        setIsZooming(false);
        stopDewarpAnimation();
      });
    });
  };

  const stopDewarpAnimation = () => {
    setIsDewarping(false);
    dewarpAnimation.stopAnimation();
    zoomAnimation.stopAnimation();
    fadeAnimation.stopAnimation();
  };

  /**
   * Apply Algorithm 1: First-Order Spatial Derivative Shadow Gradient Filtering
   * 
   * This algorithm suppresses background clutter (folds, edges, lighting variations)
   * while preserving Braille dots using gradient-based filtering.
   * 
   * Mathematical formulation:
   * Gx = I * Kx = ∂I/∂x    (Horizontal gradient)
   * Gy = I * Ky = ∂I/∂y    (Vertical gradient)
   * M(x,y) = √(Gx² + Gy²)  (Gradient magnitude)
   * θ(x,y) = tan⁻¹(Gy/Gx)  (Orientation angle)
   */
  const applyBrailleGradientFilter = async (imageUri: string): Promise<string> => {
    try {
      setDewarpProgress(10);
      
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'image.jpg';
      
      formData.append('image', {
        uri: imageUri,
        name: filename,
        type: 'image/jpeg',
      } as any);
      formData.append('kernel_size', String(kernelSize)); 
      
      setDewarpProgress(30);
      
      // Send to backend for Algorithm 1 processing
      const response = await AxiosInstance.post('/algorithm1/process/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000,
      });
      
      setDewarpProgress(70);
      
      console.log('Algorithm 1 Response:', response.data);
      
      if (response.data && response.data.status === 'success') {
        const originalDir = imageUri.substring(0, imageUri.lastIndexOf('/') + 1);

        // Save Stage 1 preprocessed (background-leveled) image
        if (response.data.preprocessed_image) {
          const preprocessedUri = originalDir + `preprocessed_${Date.now()}.jpg`;
          await FileSystem.writeAsStringAsync(preprocessedUri, response.data.preprocessed_image, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setPreprocessedImageUri(preprocessedUri);
          setDewarpProgress(100);
          return preprocessedUri;
        }
        
        throw new Error('No image data in response');
      }
      
      throw new Error('Algorithm 1 processing failed');
      
    } catch (error) {
      console.error('Algorithm 1 processing error:', error);
      // Return original image as fallback
      return imageUri;
    }
  };

  // API-based document scanner with Algorithm 1 integration
  const processImageWithScannerAPI = async (imageUri: string): Promise<string> => {
    try {
      setDewarpProgress(10);
      
      // Step 1: Apply Algorithm 1 - Gradient-based filtering
      const filteredUri = await applyBrailleGradientFilter(imageUri);
      
      setDewarpProgress(60);
      
      // Step 2: Further enhance the filtered image if needed
      if (filteredUri !== imageUri) {
        const enhanced = await ImageManipulator.manipulateAsync(
          filteredUri,
          [
            { resize: { width: 1000 } },
          ],
          { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
        );
        
        setDewarpProgress(100);
        return enhanced.uri;
      }
      
      // If no filtering was applied, return the enhanced original
      const enhanced = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          { resize: { width: 1000 } },
        ],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );
      
      setDewarpProgress(100);
      return enhanced.uri;
      
    } catch (error) {
      console.error('Scanner API error:', error);
      return imageUri;
    }
  };

  // Local processing with Algorithm 1
  const processImageLocally = async (imageUri: string): Promise<string> => {
    try {
      setDewarpProgress(20);
      
      // Apply Algorithm 1 via backend
      const filteredUri = await applyBrailleGradientFilter(imageUri);
      
      setDewarpProgress(60);
      
      // Apply enhancements
      const enhanced = await ImageManipulator.manipulateAsync(
        filteredUri,
        [
          { resize: { width: 1200 } },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      
      setDewarpProgress(80);
      
      // Final resize
      const final = await ImageManipulator.manipulateAsync(
        enhanced.uri,
        [
          { resize: { width: 1000 } },
        ],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );
      
      setDewarpProgress(100);
      return final.uri;
    } catch (error) {
      console.error('Local processing error:', error);
      return imageUri;
    }
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
    name?: string,
    outputText?: string
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
      if (outputText) formData.append('output_text', outputText);

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

  const handleCapture = async (uri: string) => {
    setImage(uri);
    setBatchImageUris([uri]);
    setBatchProcessedImageUris([]);
    setPendingImageUri(uri);
    setProcessedImageUri(uri);
    setPreprocessedImageUri(null);
    setPendingText(null);
    setShowButtons(true);
    setCurrentIndex(0);
    setDewarpProgress(100);
    setShowFilteredResult(false);
    setIsZooming(false);
  };

  const handleBatchCapture = async (uris: string[]) => {
    if (uris.length === 0) return;

    setImage(uris[0]);
    setBatchImageUris(uris);
    setBatchProcessedImageUris([]);
    setPendingImageUri(uris[0]);
    setProcessedImageUri(uris[0]);
    setPreprocessedImageUri(null);
    setPendingText(null);
    setShowButtons(true);
    setCurrentIndex(0);
    setDewarpProgress(100);
    setShowFilteredResult(false);
    setIsZooming(false);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        await handleCapture(photo.uri);
      } catch (error) {
        Alert.alert('Error', 'Failed to take picture');
      }
    }
  };

  const toggleFlash = () => {
    setFlashMode((mode) => {
      if (mode === 'off') return 'torch';
      if (mode === 'torch') return 'auto';
      return 'off';
    });
  };

  const getFlashIcon = () => {
    if (flashMode === 'off') return 'flash-off-outline';
    if (flashMode === 'torch') return 'flashlight';
    return 'flash-outline';
  };

  const getFlashColor = () => {
    if (flashMode === 'off') return '#fff';
    return '#FFD700';
  };

  const getFlashLabel = () => {
    if (flashMode === 'torch') return 'Torch on';
    if (flashMode === 'auto') return 'Flash auto';
    return 'Flash off';
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled) {
      await handleBatchCapture(result.assets.map((asset) => asset.uri).slice(0, 10));
    }
  };

  type Slide =
    | { id: number; source: any; uri: string; label: string; isLocal: boolean; type: 'image' }
    | { id: number; text: string; label: string; isLocal: boolean; type: 'text' };

  const slides: Slide[] = image
    ? (batchImageUris.length > 0 ? batchImageUris : [image]).flatMap((uri, index) => [
        {
          id: index * 2 + 1,
          source: { uri: showFilteredResult ? (batchProcessedImageUris[index] || uri) : uri },
          uri: batchProcessedImageUris[index] || uri,
          label: `Photo ${index + 1}`,
          isLocal: false,
          type: 'image' as const,
        },
        {
          id: index * 2 + 2,
          text: getSampleOutput(index),
          label: `Output ${index + 1}`,
          isLocal: true,
          type: 'text' as const,
        },
      ])
    : [];

  const handleSavePress = () => {
    const currentSlide = slides[currentIndex];
    setBatchSaveMode(null);

    if (batchImageUris.length > 1) {
      setBatchSaveMode(selectedPhotoIndices.length > 0 ? 'selected' : 'all');
      setSaveType('text');
      setImageName(`Batch_${Date.now()}`);
      setSelectedFolder(defaultFolderId);
      setShowSaveModal(true);
      return;
    }

    const name = `${currentSlide.label}_${Date.now()}`;
    setImageName(name);
    setSelectedFolder(defaultFolderId);
    
    if (currentSlide.type === 'text') {
      setSaveType('text');
      setPendingText(currentSlide.text ?? null);
      setShowSaveModal(true);
    } else {
      setPendingImageUri(currentSlide.uri ?? null);
      const pairedOutput = slides[currentIndex + 1];
      if (pairedOutput?.type === 'text') {
        setSaveType('text');
        setPendingText(pairedOutput.text);
      } else {
        setSaveType('image');
        setPendingText(null);
      }
      setShowSaveModal(true);
    }
  };

  const togglePhotoSelection = (photoIndex: number) => {
    setSelectedPhotoIndices((selected) => selected.includes(photoIndex)
      ? selected.filter((index) => index !== photoIndex)
      : [...selected, photoIndex]);
  };

  const handleConfirmSave = async () => {
    if (batchSaveMode) {
      const photoIndices = batchSaveMode === 'all'
        ? batchImageUris.map((_, index) => index)
        : selectedPhotoIndices;
      let savedCount = 0;

      for (const photoIndex of photoIndices) {
        const photoUri = batchImageUris[photoIndex];
        if (photoUri && await uploadToBackend(
          photoUri,
          selectedFolder,
          `${imageName}_Photo_${photoIndex + 1}`,
          getSampleOutput(photoIndex),
        )) {
          savedCount += 1;
        }
      }

      if (savedCount === photoIndices.length) {
        setBatchSaveMode(null);
        setShowSaveModal(false);
        Alert.alert(
          'Success',
          `${savedCount} photo and text twin${savedCount === 1 ? '' : 's'} saved!`,
          [{ text: 'OK', onPress: () => router.replace('/dashboard') }],
        );
      } else {
        Alert.alert('Warning', `${savedCount} of ${photoIndices.length} twins were saved.`);
      }
    } else if (saveType === 'text' && pendingText) {
      const photoIndex = Math.floor(currentIndex / 2);
      const photoUri = batchImageUris[photoIndex] || image;
      const photoSaved = photoUri
        ? await uploadToBackend(photoUri, selectedFolder, imageName, pendingText)
        : false;

      if (photoSaved) {
        setShowSaveModal(false);
        Alert.alert(
          'Success',
          'Photo and text output saved as one item!',
          [{ text: 'OK', onPress: () => router.replace('/dashboard') }],
        );
      } else {
        Alert.alert('Error', 'Failed to save photo and text output. Please try again.');
      }
    } else if (saveType === 'image' && pendingImageUri) {
      const success = await uploadToBackend(pendingImageUri, selectedFolder, imageName);
      if (success) {
        setShowSaveModal(false);
        Alert.alert(
          'Success',
          'Image saved successfully!',
          [{ text: 'OK', onPress: () => router.replace('/dashboard') }],
        );
      } else {
        Alert.alert('Error', 'Failed to save image. Please try again.');
      }
    } else {
      Alert.alert('Info', 'No content to save.');
    }
  };

  const handleRetake = () => {
    setImage(null);
    setBatchImageUris([]);
    setBatchProcessedImageUris([]);
    setPendingImageUri(null);
    setProcessedImageUri(null);
    setPreprocessedImageUri(null);
    setPendingText(null);
    setSelectedPhotoIndices([]);
    setBatchSaveMode(null);
    setShowButtons(false);
    setShowSaveModal(false);
    setCurrentIndex(0);
    setDewarpProgress(0);
    setShowFilteredResult(false);
    setIsZooming(false);
    stopScanAnimation();
    stopDewarpAnimation();
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
        setShowNewFolderInput(false);
        Alert.alert('Success', 'Folder created');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.slideContainer}>
      {item.type === 'image' ? (
        <View style={styles.imageFrameWrapper}>
          <View style={styles.imageContainerInner}>
            <Animated.Image 
              source={item.source} 
              style={[
                styles.fullImage, 
                {
                  transform: [{ scale: zoomAnimation }],
                  opacity: isDewarping ? fadeAnimation : 1
                }
              ]} 
              resizeMode="contain" 
            />
          </View>
          {/* Algorithm 1 processing indicator */}
          <View style={styles.algorithmBadge} pointerEvents="none">
            <Ionicons name="analytics-outline" size={14} color="#fff" />
            <Text style={styles.algorithmBadgeText}>
              Original image
            </Text>
          </View>
          {/* Clean outline overlay */}
          <View style={styles.straightenOutline} pointerEvents="none">
            <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
            <View style={[styles.cornerBracket, styles.cornerTopRight]} />
            <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
            <View style={[styles.cornerBracket, styles.cornerBottomRight]} />
          </View>
          <View style={styles.straightenedBadge} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={styles.straightenedBadgeText}>
              Processing disconnected
            </Text>
          </View>
          {batchImageUris.length > 1 ? (
            <TouchableOpacity
              style={styles.photoSelectionCheckbox}
              onPress={() => togglePhotoSelection((item.id - 1) / 2)}
            >
              <Ionicons
                name={selectedPhotoIndices.includes((item.id - 1) / 2) ? 'checkbox' : 'square-outline'}
                size={28}
                color="#fff"
              />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.textContainer}>
          <View style={styles.textHeaderRow}>
            <View style={styles.textHeaderLeft}>
              <View style={styles.textAudioBadge}>
                <Animated.View
                  style={[
                    styles.audioWave,
                    {
                      opacity: isReadingAudioEnabled ? 1 : 0.35,
                      transform: [
                        {
                          scaleY: isReadingAudioEnabled
                            ? dewarpAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.15] })
                            : 1,
                        },
                      ],
                    },
                  ]}
                />
                <Ionicons
                  name={isReadingAudioEnabled ? 'volume-high' : 'volume-mute-outline'}
                  size={16}
                  color={isReadingAudioEnabled ? '#DC143C' : '#8E8E93'}
                />
                <Text style={styles.audioBadgeText}>{isReadingAudioEnabled ? 'Reading' : 'Read aloud'}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setIsReadingAudioEnabled((enabled) => !enabled)}
              style={[styles.audioToggleButton, isReadingAudioEnabled && styles.audioToggleButtonActive]}
            >
              <Ionicons
                name={isReadingAudioEnabled ? 'toggle' : 'toggle-outline'}
                size={18}
                color={isReadingAudioEnabled ? '#fff' : '#DC143C'}
              />
              <Text style={[styles.audioToggleText, isReadingAudioEnabled && styles.audioToggleTextActive]}>
                {isReadingAudioEnabled ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.textScrollContent}>
            <Text style={styles.translatedText}>
              {item.text.split(/\s+/).filter(Boolean).map((word: string, wi: number) => (
                <Text
                  key={wi}
                  style={[
                    styles.translatedText,
                    activeWordIndex === wi && isReadingAudioEnabled ? styles.readingWordActive : null,
                  ]}
                >
                  {word}{' '}
                </Text>
              ))}
            </Text>
            {isReadingAudioEnabled ? <View style={styles.readingProgressPulse} /> : null}
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
          <Text style={styles.headerTitle}>Algorithm 1: Braille Enhancement</Text>
        </View>

        {/* Scanning phase OR Dewarping phase OR Carousel phase */}
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
              <Text style={styles.scanningText}>Applying Algorithm 1...</Text>
              <Text style={styles.scanningSubText}>First-Order Spatial Derivative Filtering</Text>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${dewarpProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{dewarpProgress}%</Text>
            </View>
          </View>
        ) : isDewarping ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: processedImageUri || image }} style={styles.fullImagePreview} resizeMode="cover" />
            <View style={styles.dewarpOverlay}>
              <Animated.View style={[styles.dewarpGrid, {
                opacity: dewarpAnimation.interpolate({
                  inputRange: [0, 0.3, 0.7, 1],
                  outputRange: [0.8, 1, 0.6, 0]
                })
              }]}>
                {[...Array(8)].map((_, index) => (
                  <Animated.View key={index} style={[styles.gridLine, {
                    transform: [{
                      scaleY: dewarpAnimation.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1, 1.2, 1]
                      })
                    }]
                  }]} />
                ))}
              </Animated.View>
              <View style={styles.dewarpStatus}>
                <ActivityIndicator size="large" color="#DC143C" />
                <Text style={styles.dewarpText}>Processing Braille Image</Text>
                <Text style={styles.dewarpSubText}>Background leveling & illumination compensation</Text>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { width: `${dewarpProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>{dewarpProgress}%</Text>
              </View>
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
                <Text style={[styles.buttonLargeText, { color: '#fff' }]}>
                  {batchImageUris.length > 1 ? 'Save All' : 'Save'}
                </Text>
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
                  {batchSaveMode ? 'Save Batch Twins' : saveType === 'text' ? 'Save Photo and Output' : 'Save Image'}
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
              <View style={styles.inputWithIcon}>
                <Text style={styles.inputLabel}>Select Folder</Text>
                <TouchableOpacity
                  onPress={() => setShowNewFolderInput(true)}
                  style={styles.addFolderIcon}
                  accessibilityLabel="Create new folder"
                >
                  <Ionicons name="folder-outline" size={20} color="#DC143C" />
                  <View style={styles.addFolderBadge}>
                    <Ionicons name="add" size={12} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>
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
        <Modal
          visible={showNewFolderInput}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNewFolderInput(false)}
        >
          <View style={styles.newFolderModalOverlay}>
            <View style={styles.newFolderModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create New Folder</Text>
                <TouchableOpacity onPress={() => setShowNewFolderInput(false)}>
                  <Ionicons name="close" size={24} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.newFolderInput}
                placeholder="Folder name"
                placeholderTextColor="#C7C7CC"
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoFocus
              />
              <View style={styles.newFolderModalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowNewFolderInput(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={createNewFolder}>
                  <Text style={styles.saveButtonText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Camera view — fixed 4:3 aspect ratio so the viewfinder matches what gets captured
  const cameraWidth = width;
  const cameraHeight = Math.round(width * (4 / 3));
  const headerHeight = 100; // paddingTop 50 + paddingBottom 5 + ~45 content
  const bottomControlsHeight = 110; // bottom 30 + button ~80
  const availableHeight = height - headerHeight - bottomControlsHeight;
  // If the 4:3 box is taller than available space, constrain to available and derive width
  const finalCameraHeight = Math.min(cameraHeight, availableHeight);
  const finalCameraWidth = Math.round(finalCameraHeight * (3 / 4));
  const bandHeight = Math.max(0, (availableHeight - finalCameraHeight) / 2);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Braille Scanner</Text>
      </View>

      {/* Top scope band */}
      <View style={[styles.scopeBand, { height: Math.max(bandHeight, 44) }]}>
        <View style={styles.scopeBandContent}>
          <View style={styles.scopeIndicatorDot} />
          <Text style={styles.scopeBandText}>Outside capture area</Text>
          <View style={styles.scopeIndicatorDot} />
        </View>
      </View>

      {/* Camera — exact 4:3 capture area */}
      <View style={[styles.cameraWrapper, { width: finalCameraWidth, height: finalCameraHeight, alignSelf: 'center' }]}>
        <CameraView
          ref={cameraRef}
          style={{ width: finalCameraWidth, height: finalCameraHeight }}
          facing="back"
          flash={flashMode === 'torch' ? 'off' : flashMode}
          enableTorch={flashMode === 'torch'}
        />
        {/* Corner brackets showing capture boundary */}
        <View style={styles.captureFrame} pointerEvents="none">
          <View style={[styles.capCorner, styles.capTopLeft]} />
          <View style={[styles.capCorner, styles.capTopRight]} />
          <View style={[styles.capCorner, styles.capBottomLeft]} />
          <View style={[styles.capCorner, styles.capBottomRight]} />
        </View>
        <View style={styles.cameraOverlay} pointerEvents="none">
          <Text style={styles.overlayText}>Position Braille paper in frame</Text>
        </View>
      </View>

      {/* Bottom scope band */}
      <View style={[styles.scopeBand, { height: Math.max(bandHeight, 44) }]}>
        <View style={styles.scopeBandContent}>
          <View style={styles.scopeIndicatorDot} />
          <Text style={styles.scopeBandText}>Outside capture area</Text>
          <View style={styles.scopeIndicatorDot} />
        </View>
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
          <Ionicons name="images-outline" size={28} color="#fff" />
          <Text style={styles.galleryText}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.flashButton}
          onPress={toggleFlash}
          accessibilityRole="button"
          accessibilityLabel={getFlashLabel()}
        >
          <Ionicons name={getFlashIcon()} size={24} color={getFlashColor()} />
          <Text style={styles.flashText}>{flashMode === 'torch' ? 'Torch' : flashMode === 'auto' ? 'Auto' : 'Off'}</Text>
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
  // Scope bands — clearly mark areas outside the capture region
  scopeBand: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeBandContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scopeIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  scopeBandText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Camera wrapper — constrains to exact 4:3 capture ratio
  cameraWrapper: {
    overflow: 'hidden',
    position: 'relative',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  overlayText: {
    color: '#fff', fontSize: 13, opacity: 0.9,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  // Corner bracket overlay on the live viewfinder
  captureFrame: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  capCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#DC143C',
  },
  capTopLeft: {
    top: 12, left: 12,
    borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 5,
  },
  capTopRight: {
    top: 12, right: 12,
    borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 5,
  },
  capBottomLeft: {
    bottom: 12, left: 12,
    borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 5,
  },
  capBottomRight: {
    bottom: 12, right: 12,
    borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 5,
  },
  bottomControls: {
    height: 110,
    width: '100%',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 30,
    backgroundColor: '#000',
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
    minHeight: 54,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  flashText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  // Preview
  previewContainer: { flex: 1, backgroundColor: '#fff' },
  imageContainer: { flex: 1, position: 'relative', backgroundColor: '#000' },
  fullImagePreview: {
    width: width - 20, height: height * 0.6,
    alignSelf: 'center', marginTop: 10, borderRadius: 8,
  },

  // Carousel wrapper
  carouselWrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  slideContainer: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFrameWrapper: {
    width: width - 20,
    height: height * 0.7,
    borderRadius: 8,
    position: 'relative',
    backgroundColor: '#fff',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainerInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  fullImage: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  photoSelectionCheckbox: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    padding: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  straightenOutline: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  cornerBracket: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#DC143C',
  },
  cornerTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  cornerTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  cornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  straightenedBadge: {
    position: 'absolute',
    top: 28,
    right: 28,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  straightenedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  algorithmBadge: {
    position: 'absolute',
    top: 28,
    left: 28,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 20, 60, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  algorithmBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  textContainer: {
    width: width - 40,
    height: height * 0.7,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    paddingTop: 16,
    gap: 12,
  },
  textHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textHeaderLeft: {
    flex: 1,
  },
  textAudioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  audioWave: {
    width: 4,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#DC143C',
  },
  audioBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  audioToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DC143C',
    backgroundColor: '#fff',
  },
  audioToggleButtonActive: {
    backgroundColor: '#DC143C',
  },
  audioToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC143C',
  },
  audioToggleTextActive: {
    color: '#fff',
  },
  textScrollContent: {
    flexGrow: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  translatedText: {
    fontSize: 14,
    color: '#333',
    fontFamily: 'monospace',
    lineHeight: 22,
    textAlign: 'left',
  },
  readingWordActive: {
    backgroundColor: 'rgba(220, 20, 60, 0.18)',
    color: '#000',
    textShadowColor: 'rgba(220, 20, 60, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  readingProgressPulse: {
    marginTop: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(220, 20, 60, 0.35)',
    overflow: 'hidden',
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
  scanningSubText: { color: '#ccc', fontSize: 12, marginTop: 4 },
  
  // Progress
  progressContainer: {
    width: '80%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#DC143C',
    borderRadius: 4,
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },

  // Dewarping
  dewarpOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dewarpGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
    justifyContent: 'space-around',
    padding: 20,
  },
  gridLine: {
    height: 1,
    backgroundColor: 'rgba(220, 20, 60, 0.3)',
    width: '100%',
  },
  dewarpStatus: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
    borderRadius: 12,
  },
  dewarpText: { color: '#fff', fontSize: 16, marginTop: 12, fontWeight: '600' },
  dewarpSubText: { color: '#ccc', fontSize: 12, marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, width: '90%', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 12 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  editIcon: { padding: 4 },
  addFolderIcon: { padding: 4, position: 'relative' },
  addFolderBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC143C',
  },
  newFolderModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  newFolderModalContent: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, width: '86%' },
  newFolderInput: { borderWidth: 1, borderColor: '#D1D1D6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, color: '#1A1A1A', fontSize: 15 },
  newFolderModalButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
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