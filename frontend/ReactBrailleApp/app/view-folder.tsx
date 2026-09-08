import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Image, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AxiosInstance from '../axios';
import { synthesizeSpeech, playWithHighlights } from '../utils/azureTts';
import * as Print from 'expo-print';

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
  output_text?: string;
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
  const [showCombinedOutputModal, setShowCombinedOutputModal] = useState(false);
  const [isCombinedSpeechEnabled, setIsCombinedSpeechEnabled] = useState(false);
  const [isSpeechPlaying, setIsSpeechPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [showCombinedPhotos, setShowCombinedPhotos] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [combinedOutputScope, setCombinedOutputScope] = useState<'all' | 'selected'>('all');
  const [speechWordIndex, setSpeechWordIndex] = useState(-1);
  const speechWordIndexRef = useRef(-1);
  const ttsCleanupRef = useRef<(() => void) | null>(null);
  const speechSession = useRef(0);
  const pausedAtMs = useRef(0);
  const ttsResultRef = useRef<{ audioUri: string | null; wordTimestamps: any[]; totalMs: number } | null>(null);
  const combinedScrollRef = useRef<ScrollView>(null);
  const wordRefs = useRef<Map<number, any>>(new Map());
  const scrollViewHeight = useRef(0);
  const scrollViewScreenY = useRef(0);
  const currentScrollY = useRef(0);
  const isUserScrolling = useRef(false);
  const userScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCombinedSpeech = (clearPosition = false) => {
    // Record paused position before stopping
    if (!clearPosition && speechWordIndexRef.current >= 0 && ttsResultRef.current) {
      const ts = ttsResultRef.current.wordTimestamps[speechWordIndexRef.current];
      if (ts) pausedAtMs.current = ts.offsetMs;
    } else if (clearPosition) {
      pausedAtMs.current = 0;
    }
    speechSession.current += 1;
    if (ttsCleanupRef.current) {
      ttsCleanupRef.current();
      ttsCleanupRef.current = null;
    }
    speechWordIndexRef.current = -1;
    setSpeechWordIndex(-1);
    setIsSpeechPlaying(false);
    if (userScrollTimer.current) clearTimeout(userScrollTimer.current);
    isUserScrolling.current = false;
  };

  const closeCombinedOutputModal = () => {
    // Pause but keep position so user can resume when they come back
    stopCombinedSpeech(false);
    wordRefs.current.clear();
    setIsCombinedSpeechEnabled(false);
    setShowCombinedOutputModal(false);
  };

  // Auto-start speech when modal opens if autoPlay is enabled
  useEffect(() => {
    if (showCombinedOutputModal && autoPlay && !isCombinedSpeechEnabled) {
      setIsCombinedSpeechEnabled(true);
    }
  }, [showCombinedOutputModal]);
  useEffect(() => {
    if (!isCombinedSpeechEnabled || speechWordIndex < 0 || isUserScrolling.current) return;
    const wordRef = wordRefs.current.get(speechWordIndex);
    if (!wordRef || !combinedScrollRef.current) return;

    // measure() gives absolute screen coordinates of the word
    wordRef.measure((fx: number, fy: number, w: number, h: number, px: number, py: number) => {
      // py = word's top Y on screen
      // scrollViewScreenY = ScrollView's top Y on screen
      // currentScrollY = how far we've already scrolled
      // So the word's position within scroll content = py - scrollViewScreenY + currentScrollY
      const wordScrollY = py - scrollViewScreenY.current + currentScrollY.current;
      const viewH = scrollViewHeight.current || 400;
      const targetY = Math.max(0, wordScrollY - viewH * 0.33);
      combinedScrollRef.current?.scrollTo({ y: targetY, animated: true });
    });
  }, [speechWordIndex, isCombinedSpeechEnabled]);

  useEffect(() => {
    loadFolderContents();
    AsyncStorage.getItem('tts_autoplay').then((val) => {
      if (val === 'true') setAutoPlay(true);
    });
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
    openCombinedOutputs('selected');
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

  const folderOutputItems = images.filter((item) => item.output_text);
  const combinedOutputItems = images
    .filter((item) => item.output_text && (
      combinedOutputScope === 'all' || selectedImages.includes(item.image_id)
    ));
  const combinedOutputText = combinedOutputItems
    .map((item) => item.output_text)
    .join('\n\n');

  const openCombinedOutputs = (scope: 'all' | 'selected') => {
    const outputItems = images.filter((item) => item.output_text && (
      scope === 'all' || selectedImages.includes(item.image_id)
    ));

    if (outputItems.length === 0) {
      Alert.alert('No outputs', 'The selected photos do not have text outputs.');
      return;
    }

    // Only reset position/cache if opening different content
    if (scope !== combinedOutputScope) {
      pausedAtMs.current = 0;
      ttsResultRef.current = null;
    }
    setCombinedOutputScope(scope);
    setShowCombinedOutputModal(true);
  };

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const exportCombinedPdf = async (
    scope: 'all' | 'selected' = combinedOutputScope,
    includePhotos = showCombinedPhotos,
  ) => {
    const outputItems = images.filter((item) => item.output_text && (
      scope === 'all' || selectedImages.includes(item.image_id)
    ));

    if (outputItems.length === 0) {
      Alert.alert('No outputs', 'The selected photos do not have text outputs.');
      return;
    }

    setIsExportingPdf(true);
    try {
      const title = escapeHtml(String(folderName || 'Folder'));
      const outputSections = outputItems.map((item) => `
        <section class="output">
          ${includePhotos && item.image_url
            ? `<img src="${escapeHtml(item.image_url)}" class="photo" />`
            : ''}
          <p>${escapeHtml(item.output_text || '')}</p>
        </section>
      `).join('');
      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: sans-serif; color: #1A1A1A; padding: 24px; }
              h1 { color: #DC143C; font-size: 24px; margin-bottom: 24px; }
              p { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
              .output { page-break-inside: avoid; border-bottom: 1px solid #E5E5EA; padding-bottom: 20px; margin-bottom: 20px; }
              .photo { display: block; width: 100%; max-height: 360px; object-fit: contain; margin-bottom: 12px; }
            </style>
          </head>
          <body><h1>${title}</h1>${outputSections}</body>
        </html>
      `;

      // Use the native print/save dialog — no file permissions needed
      await Print.printAsync({ html });
    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert('Error', 'Failed to create the PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  useEffect(() => {
    if (!showCombinedOutputModal || !isCombinedSpeechEnabled || !combinedOutputText) {
      stopCombinedSpeech();
      setIsSpeechPlaying(false);
      return;
    }

    stopCombinedSpeech();
    setIsSpeechPlaying(true);
    const currentSession = speechSession.current;
    let cancelled = false;
    const resumeFrom = pausedAtMs.current;

    const startPlayback = (result: { audioUri: string | null; wordTimestamps: any[]; totalMs: number }) => {
      if (cancelled || currentSession !== speechSession.current) return;
      ttsResultRef.current = result;
      playWithHighlights(
        result.audioUri,
        result.wordTimestamps,
        result.totalMs,
        (idx) => { if (!cancelled) { speechWordIndexRef.current = idx; setSpeechWordIndex(idx); } },
        () => {
          if (!cancelled) {
            speechWordIndexRef.current = -1;
            setSpeechWordIndex(-1);
            setIsSpeechPlaying(false);
            pausedAtMs.current = 0; // finished — reset position
            ttsResultRef.current = null;
          }
        },
        combinedOutputText,
        resumeFrom,
      ).then((cleanup) => {
        if (cancelled) { cleanup(); return; }
        ttsCleanupRef.current = cleanup;
      });
    };

    // Reuse cached audio if available and text hasn't changed
    if (ttsResultRef.current) {
      startPlayback(ttsResultRef.current);
    } else {
      synthesizeSpeech(combinedOutputText)
        .then(startPlayback)
        .catch((err) => { console.error('Azure TTS error:', err); setIsSpeechPlaying(false); });
    }

    return () => {
      cancelled = true;
      stopCombinedSpeech();
      setIsSpeechPlaying(false);
    };
  }, [isCombinedSpeechEnabled, combinedOutputText, showCombinedOutputModal]);

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
        {item.is_text && !item.output_text && (
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>TXT</Text>
          </View>
        )}
        {item.output_text && (
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>PHOTO + TXT</Text>
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
                <Ionicons name="albums-outline" size={20} color="#DC143C" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => exportCombinedPdf('selected', true)}
                style={styles.selectionActionBtn}
                accessibilityLabel="Save selected outputs as PDF"
                disabled={isExportingPdf}
              >
                {isExportingPdf ? (
                  <ActivityIndicator size="small" color="#DC143C" />
                ) : (
                  <Ionicons name="document-text-outline" size={20} color="#DC143C" />
                )}
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
            {folderOutputItems.length > 0 ? (
              <TouchableOpacity
                style={styles.allOutputsButton}
                onPress={() => openCombinedOutputs('all')}
                accessibilityLabel="View all outputs"
              >
                <Ionicons name="albums-outline" size={18} color="#DC143C" />
              </TouchableOpacity>
            ) : null}
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
              selectedItem.output_text ? (
                <View style={styles.twinContentView}>
                  <Image
                    source={{ uri: selectedItem.image_url }}
                    style={styles.twinImage}
                    resizeMode="contain"
                  />
                  <ScrollView
                    style={styles.attachedOutputScroll}
                    contentContainerStyle={styles.attachedOutputContainer}
                    showsVerticalScrollIndicator={true}
                    indicatorStyle="black"
                  >
                    <Text style={styles.attachedOutputLabel}>Text output</Text>
                    <Text style={styles.fullScreenText}>{selectedItem.output_text}</Text>
                  </ScrollView>
                </View>
              ) : (
                <ScrollView
                  style={styles.fullScreenImageView}
                  contentContainerStyle={styles.fullScreenImageContent}
                >
                  <Image
                    source={{ uri: selectedItem.image_url }}
                    style={styles.fullScreenImage}
                    resizeMode="contain"
                  />
                </ScrollView>
              )
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCombinedOutputModal}
        transparent
        animationType="slide"
        onRequestClose={closeCombinedOutputModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.combinedOutputModalContent}>
            <View style={styles.combinedOutputHeader}>
              <TouchableOpacity
                onPress={closeCombinedOutputModal}
                style={styles.combinedOutputBackButton}
                accessibilityLabel="Back to folder"
              >
                <Ionicons name="chevron-back" size={28} color="#1A1A1A" />
              </TouchableOpacity>
              <Text style={styles.combinedOutputTitle}>{folderName || 'Folder'}</Text>
              <View style={styles.combinedOptionsRow}>
                <TouchableOpacity
                  onPress={() => {
                    setIsCombinedSpeechEnabled((enabled) => !enabled);
                  }}
                  style={styles.combinedIconToggle}
                  accessibilityLabel={isSpeechPlaying ? 'Pause speech' : 'Play speech'}
                >
                  <Ionicons
                    name={isSpeechPlaying ? 'pause' : 'play'}
                    size={21}
                    color={isSpeechPlaying ? '#DC143C' : '#8E8E93'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowCombinedPhotos((visible) => !visible)}
                  style={styles.combinedIconToggle}
                  accessibilityLabel={showCombinedPhotos ? 'Hide photos' : 'Show photos'}
                >
                  <Ionicons
                    name={showCombinedPhotos ? 'image' : 'image-outline'}
                    size={21}
                    color={showCombinedPhotos ? '#DC143C' : '#8E8E93'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => exportCombinedPdf()}
                  style={styles.combinedIconToggle}
                  accessibilityLabel="Save outputs as PDF"
                  disabled={isExportingPdf}
                >
                  {isExportingPdf ? (
                    <ActivityIndicator size="small" color="#DC143C" />
                  ) : (
                    <Ionicons name="document-text-outline" size={21} color="#DC143C" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView
              ref={combinedScrollRef}
              style={styles.combinedOutputScroll}
              contentContainerStyle={styles.combinedOutputContent}
              showsVerticalScrollIndicator
              indicatorStyle="black"
              onLayout={(e) => {
                scrollViewHeight.current = e.nativeEvent.layout.height;
                // Capture screen Y of the ScrollView
                combinedScrollRef.current?.measure((_fx, _fy, _w, _h, _px, py) => {
                  scrollViewScreenY.current = py;
                });
              }}
              onScroll={(e) => {
                currentScrollY.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              onScrollBeginDrag={() => {
                isUserScrolling.current = true;
                if (userScrollTimer.current) clearTimeout(userScrollTimer.current);
                userScrollTimer.current = setTimeout(() => {
                  isUserScrolling.current = false;
                }, 3000);
              }}
            >
              {(() => {
                let globalWordOffset = 0;

                return combinedOutputItems.map((item) => {
                  const outputText = item.output_text || '';
                  const words = outputText.split(/\s+/).filter(Boolean);
                  const itemWordStart = globalWordOffset;
                  globalWordOffset += words.length;
                  const itemId = item.image_id;

                  return (
                    <View
                      key={itemId}
                      style={styles.combinedOutputItem}
                    >
                      {showCombinedPhotos && item.image_url ? (
                        <Image
                          source={{ uri: item.image_url }}
                          style={styles.combinedOutputImage}
                          resizeMode="contain"
                        />
                      ) : null}
                      <View style={styles.wordWrapContainer}>
                        {words.map((word, wi) => {
                          const globalIdx = itemWordStart + wi;
                          const isActive = isCombinedSpeechEnabled && speechWordIndex === globalIdx;
                          return (
                            <Text
                              key={wi}
                              ref={(r) => {
                                if (r) wordRefs.current.set(globalIdx, r);
                                else wordRefs.current.delete(globalIdx);
                              }}
                              style={[styles.wordToken, isActive && styles.speechWordActive]}
                            >
                              {word}{' '}
                            </Text>
                          );
                        })}
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>
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
  allOutputsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#DC143C',
    borderRadius: 8,
  },
  allOutputsButtonText: {
    color: '#DC143C',
    fontSize: 12,
    fontWeight: '600',
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
    paddingTop: 100,
    paddingBottom: 40,
  },
  fullScreenImageContent: {
    alignItems: 'center',
  },
  twinContentView: {
    flex: 1,
    paddingTop: 100,
    paddingBottom: 24,
  },
  twinImage: {
    width: width,
    height: height * 0.42,
  },
  attachedOutputScroll: {
    flex: 1,
    marginHorizontal: 24,
    backgroundColor: '#F7F7F7',
    borderRadius: 8,
  },
  fullScreenImage: {
    width: width,
    height: height * 0.8,
  },
  attachedOutputContainer: {
    paddingHorizontal: 16,
    padding: 16,
  },
  attachedOutputLabel: {
    marginBottom: 8,
    color: '#DC143C',
    fontSize: 14,
    fontWeight: '700',
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
  speechWordActive: {
    backgroundColor: 'rgba(220, 20, 60, 0.18)',
    color: '#000',
  },
  wordWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  wordToken: {
    fontSize: 16,
    color: '#1A1A1A',
    fontFamily: 'monospace',
    lineHeight: 26,
  },
  combinedOutputModalContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  combinedOutputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 18,
  },
  combinedOutputBackButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 4,
  },
  combinedOutputTitle: {
    flex: 1,
    marginRight: 8,
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'right',
  },
  combinedOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  combinedIconToggle: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 19,
    backgroundColor: '#F7F7F7',
  },
  combinedOutputScroll: {
    flex: 1,
    backgroundColor: '#F7F7F7',
    borderRadius: 8,
  },
  combinedOutputContent: {
    padding: 16,
  },
  combinedOutputItem: {
    marginBottom: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  combinedOutputImage: {
    width: '100%',
    height: height * 0.28,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
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