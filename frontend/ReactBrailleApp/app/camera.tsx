import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Dimensions,
  Animated,
  FlatList,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Accelerometer } from "expo-sensors";
import * as ImagePicker from "expo-image-picker";
import Slider from "@react-native-community/slider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AxiosInstance from "../axios";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { synthesizeSpeech, playWithHighlights } from "../utils/azureTts";
import { useDisplay } from "../context/DisplayContext";

const { width, height } = Dimensions.get("window");
const DEFAULT_FOLDER_KEY = "default_folder_id";

// Tolerance for "perfectly flat" (in g). Lower = stricter.
const LEVEL_TOLERANCE = 0.08;

// ============================================================================
// LIVE DISTANCE POLLING — HIDDEN
//
// `false` (default):  User presses shutter → 1 photo → POSTed to
//                     /algorithm1/coverage/ → kept only if balanced.
// `true`:             A throwaway snapshot every 1.5 s updates the pill live.
// ============================================================================
const ENABLE_LIVE_DISTANCE_POLLING = false;

// Interval used ONLY when ENABLE_LIVE_DISTANCE_POLLING is true.
const COVERAGE_POLL_INTERVAL_MS = 1500;

// ============================================================================
// Distance bands — MUST match the backend thresholds AND your spec:
//     pct < 60            -> too_far   (0–59)
//     60 <= pct < 80      -> balanced  (60–79)
//     pct >= 80           -> too_close (80–100)
// ============================================================================
const TOO_FAR_MAX_PCT = 60;
const TOO_CLOSE_MIN_PCT = 80;

type DistanceStatus = "unknown" | "too_far" | "balanced" | "too_close";

export default function CameraScreen() {
  const { fontScale, fontWeight, theme, setFontScale, setFontWeight } =
    useDisplay();
  const cameraRef = useRef<any>(null);
  const flatListRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [image, setImage] = useState<string | null>(null);
  const [batchImageUris, setBatchImageUris] = useState<string[]>([]);
  const [batchProcessedImageUris, setBatchProcessedImageUris] = useState<
    string[]
  >([]);
  const [batchTextOutputs, setBatchTextOutputs] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<number | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [imageName, setImageName] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [selectedPhotoIndices, setSelectedPhotoIndices] = useState<number[]>(
    [],
  );
  const [batchSaveMode, setBatchSaveMode] = useState<"all" | "selected" | null>(
    null,
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flashMode, setFlashMode] = useState<"off" | "torch" | "auto">("off");
  const [saveType, setSaveType] = useState<"image" | "text">("image");
  const [dewarpProgress, setDewarpProgress] = useState(0);
  const [showReferencePage, setShowReferencePage] = useState(false);
  const [referenceCountdown, setReferenceCountdown] = useState(3);
  const [showOutputSettings, setShowOutputSettings] = useState(false);
  const [isReadingAudioEnabled, setIsReadingAudioEnabled] = useState(false);
  const ttsCleanupRef = useRef<(() => void) | null>(null);
  const ttsLoadingRef = useRef(false);

  // Level state from accelerometer (SECONDARY check)
  const [isLevel, setIsLevel] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Distance state — updated by the live poller (if enabled) OR by the
  // on-demand check inside takePicture (if disabled — the current default).
  const [distanceStatus, setDistanceStatus] =
    useState<DistanceStatus>("unknown");
  const [distancePercentage, setDistancePercentage] = useState<number | null>(
    null,
  );
  const [isCheckingDistance, setIsCheckingDistance] = useState(false);

  // Synchronous lock so a rapid double-tap can't enter takePicture twice.
  const checkingDistanceRef = useRef(false);

  // Serialises takePictureAsync calls
  const cameraLockRef = useRef(false);
  const acquireCamera = async <T,>(fn: () => Promise<T>): Promise<T> => {
    while (cameraLockRef.current) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    cameraLockRef.current = true;
    try {
      return await fn();
    } finally {
      cameraLockRef.current = false;
    }
  };

  const [scanAnimation] = useState(() => new Animated.Value(0));
  const [dewarpAnimation] = useState(() => new Animated.Value(0));

  // Accelerometer subscription — tracks tilt, updates isLevel (SECONDARY indicator)
  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(({ x, y }) => {
      setTilt({ x, y });
      const flat =
        Math.abs(x) < LEVEL_TOLERANCE && Math.abs(y) < LEVEL_TOLERANCE;
      setIsLevel(flat);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!showReferencePage || referenceCountdown <= 0) return undefined;
    const timer = setTimeout(() => {
      setReferenceCountdown((countdown) => Math.max(0, countdown - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [showReferencePage, referenceCountdown]);

  // ---------------------------------------------------------------------------
  // Safety net: if `isCheckingDistance` ever stays true for >20 s, force-clear
  // it. This protects against unexpected hangs (network, filesystem, etc.) and
  // guarantees the shutter never gets stuck forever.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isCheckingDistance) return undefined;
    const safety = setTimeout(() => {
      console.warn("isCheckingDistance stuck — force resetting after 20s");
      checkingDistanceRef.current = false;
      setIsCheckingDistance(false);
    }, 20000);
    return () => clearTimeout(safety);
  }, [isCheckingDistance]);

  // ---------------------------------------------------------------------------
  // LIVE distance polling — gated behind ENABLE_LIVE_DISTANCE_POLLING.
  // When the flag is `false` this effect exits immediately; no snapshots are
  // taken behind the scenes.
  // ---------------------------------------------------------------------------
  const shouldPoll =
    ENABLE_LIVE_DISTANCE_POLLING &&
    !image &&
    !showReferencePage &&
    !showSaveModal &&
    permission?.granted === true;

  useEffect(() => {
    if (!ENABLE_LIVE_DISTANCE_POLLING) return undefined;
    if (!shouldPoll) {
      setDistanceStatus("unknown");
      setDistancePercentage(null);
      return undefined;
    }

    let cancelled = false;

    const measure = async () => {
      if (cancelled || !cameraRef.current) return;
      try {
        const photo = (await acquireCamera(() =>
          cameraRef.current.takePictureAsync({
            quality: 0.15,
            skipProcessing: true,
          }),
        )) as { uri?: string } | undefined;
        if (cancelled || !photo?.uri) return;

        const formData = new FormData();
        formData.append("image", {
          uri: photo.uri,
          name: `distance_${Date.now()}.jpg`,
          type: "image/jpeg",
        } as any);

        const response = await AxiosInstance.post(
          "/algorithm1/coverage/",
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 8000,
          },
        );
        if (cancelled) return;

        const pct = response.data?.distance_percentage;
        const status = response.data?.distance_status as string | undefined;

        let next: DistanceStatus = "unknown";
        if (typeof pct === "number") {
          setDistancePercentage(pct);
          if (pct < TOO_FAR_MAX_PCT) next = "too_far";
          else if (pct >= TOO_CLOSE_MIN_PCT) next = "too_close";
          else next = "balanced";
        } else if (
          status === "too_far" ||
          status === "balanced" ||
          status === "too_close"
        ) {
          next = status;
        }
        setDistanceStatus(next);
      } catch (err) {
        console.warn("Distance measurement failed:", err);
      }
    };

    const initial = setTimeout(measure, 700);
    const interval = setInterval(measure, COVERAGE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [shouldPoll]);

  useEffect(() => {
    if (ttsCleanupRef.current) {
      ttsCleanupRef.current();
      ttsCleanupRef.current = null;
    }
    const isTextSlide = currentIndex % 3 === 2;
    const photoIndex = Math.floor(currentIndex / 3);
    const textToSpeak = isTextSlide ? batchTextOutputs[photoIndex] : null;

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
          () => {},
          () => {},
          textToSpeak,
        ).then((cleanup) => {
          if (cancelled) {
            cleanup();
            return;
          }
          ttsCleanupRef.current = cleanup;
        });
      })
      .catch((err) => {
        console.error("Azure TTS error:", err);
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
    };
  }, [batchTextOutputs, currentIndex, isReadingAudioEnabled]);

  const saveDefaultFolder = async (folderId: number | null) => {
    try {
      if (folderId) {
        await AsyncStorage.setItem(DEFAULT_FOLDER_KEY, folderId.toString());
      } else {
        await AsyncStorage.removeItem(DEFAULT_FOLDER_KEY);
      }
      setDefaultFolderId(folderId);
    } catch (e) {
      console.error("Failed to save default folder", e);
    }
  };

  const startScanAnimation = () => {
    setIsScanning(true);
    scanAnimation.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnimation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnimation, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  };

  const stopScanAnimation = () => {
    setIsScanning(false);
    scanAnimation.stopAnimation();
  };

  useEffect(() => {
    void requestPermission().catch((error) => {
      console.error("Camera permission request failed:", error);
    });
    void AxiosInstance.get("/folders/")
      .then((response) => {
        if (response.data?.folders) setFolders(response.data.folders);
      })
      .catch((error) => {
        console.error("Error loading folders:", error);
      });
    void AsyncStorage.getItem(DEFAULT_FOLDER_KEY)
      .then((saved) => {
        if (saved) setDefaultFolderId(Number(saved));
      })
      .catch((error) => {
        console.error("Failed to load default folder:", error);
      });
  }, [requestPermission]);

  const uploadToBackend = async (
    imageUri: string,
    folderId: number | null,
    name?: string,
    outputText?: string,
    processedImageUri?: string,
  ) => {
    setUploading(true);
    try {
      const formData = new FormData();
      if (folderId) formData.append("folder", folderId.toString());
      const filename = imageUri.split("/").pop() || "";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";
      formData.append("image", {
        uri: imageUri,
        name: `captured_${Date.now()}.jpg`,
        type,
      } as any);
      if (processedImageUri) {
        formData.append("processed_image", {
          uri: processedImageUri,
          name: `processed_${Date.now()}.png`,
          type: "image/png",
        } as any);
      }
      formData.append(
        "image_name",
        name || `Capture_${new Date().toLocaleString()}`,
      );
      if (outputText !== undefined) formData.append("output_text", outputText);
      const response = await AxiosInstance.post("/images/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data && response.data.status === "success";
    } catch (error) {
      console.error("Upload error:", error);
      return false;
    } finally {
      setUploading(false);
    }
  };

  const processCapturedPhotos = async (uris: string[]) => {
    if (uris.length === 0) return;

    setImage(uris[0]);
    setBatchImageUris(uris);
    setBatchProcessedImageUris([]);
    setBatchTextOutputs([]);
    setPendingImageUri(uris[0]);
    setPendingText(null);
    setProcessingError(null);
    setShowButtons(false);
    setCurrentIndex(0);
    setDewarpProgress(5);
    startScanAnimation();

    try {
      const processedUris: string[] = [];
      const textOutputs: string[] = [];

      for (let index = 0; index < uris.length; index += 1) {
        const uri = uris[index];
        const filename = uri.split("/").pop() || `capture_${index + 1}.jpg`;
        const formData = new FormData();
        formData.append("image", {
          uri,
          name: filename,
          type: "image/jpeg",
        } as any);

        const response = await AxiosInstance.post(
          "/algorithm1/preprocess/",
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 660000,
          },
        );
        const imageBase64 = response.data?.processed_image_base64;
        const outputText = response.data?.output_text;
        if (
          response.data?.status !== "success" ||
          typeof imageBase64 !== "string" ||
          typeof outputText !== "string"
        ) {
          throw new Error(
            response.data?.message ||
              "The preprocessing response was incomplete.",
          );
        }

        const outputDirectory =
          FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!outputDirectory)
          throw new Error(
            "No local storage is available for the processed image.",
          );
        const processedUri = `${outputDirectory}braille-output-${Date.now()}-${index}.png`;
        await FileSystem.writeAsStringAsync(processedUri, imageBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        processedUris.push(processedUri);
        textOutputs.push(outputText);
        setDewarpProgress(Math.round(((index + 1) / uris.length) * 100));
      }

      setBatchProcessedImageUris(processedUris);
      setBatchTextOutputs(textOutputs);
      setPendingText(textOutputs[0]);
      setShowButtons(true);
    } catch (error) {
      console.error("Braille preprocessing failed:", error);
      setProcessingError(
        "The photo could not be processed. Check that the backend is running and try again.",
      );
    } finally {
      stopScanAnimation();
    }
  };

  const handleCapture = async (uri: string) => {
    await processCapturedPhotos([uri]);
  };

  const handleBatchCapture = async (uris: string[]) => {
    await processCapturedPhotos(uris);
  };

  /**
   * Capture button handler.
   *
   * Split into TWO phases so the "Checking distance…" spinner can never get
   * stuck when the user cancels during preprocessing:
   *
   *   Phase 1 (short):  take one photo → POST to /coverage/ → decide.
   *                     Owns `isCheckingDistance`; ALWAYS clears it in finally.
   *   Phase 2 (long):   if balanced, hand off to handleCapture().
   *                     Does NOT touch `isCheckingDistance`, so Retake during
   *                     preprocessing leaves the camera screen clean.
   */
  const takePicture = async () => {
    if (!isLevel) {
      Alert.alert(
        "Not level",
        "Tilt the phone until it is perfectly flat over the page.",
      );
      return;
    }
    if (!cameraRef.current || checkingDistanceRef.current) return;

    // ---- Live-polling mode: the poller has already gated the button ----
    if (ENABLE_LIVE_DISTANCE_POLLING) {
      if (distanceStatus === "too_far") {
        Alert.alert("Too far", "Move the phone closer to the Braille paper.");
        return;
      }
      if (distanceStatus === "too_close") {
        Alert.alert(
          "Too close",
          "Move the phone farther back from the Braille paper.",
        );
        return;
      }
      if (distanceStatus !== "balanced") {
        Alert.alert("Wait a moment", "Measuring distance — please hold still.");
        return;
      }
      try {
        const photo = (await acquireCamera(() =>
          cameraRef.current.takePictureAsync({ quality: 0.8 }),
        )) as { uri?: string } | null;
        if (!photo?.uri) throw new Error("Camera returned no URI.");
        await handleCapture(photo.uri);
      } catch (error) {
        console.error("Failed to take picture:", error);
        Alert.alert("Error", "Failed to take picture. Please try again.");
      }
      return;
    }

    // ---- On-demand mode (default) ----
    // PHASE 1: capture + distance check. isCheckingDistance lives and dies here.
    checkingDistanceRef.current = true;
    setIsCheckingDistance(true);

    let photoUri: string | null = null;
    let balanced = false;

    try {
      const photo = (await acquireCamera(() =>
        cameraRef.current.takePictureAsync({ quality: 0.8 }),
      )) as { uri?: string } | null;
      if (!photo?.uri) throw new Error("Camera returned no URI.");
      photoUri = photo.uri;

      const formData = new FormData();
      formData.append("image", {
        uri: photo.uri,
        name: "distance-check.jpg",
        type: "image/jpeg",
      } as any);

      const response = await AxiosInstance.post(
        "/algorithm1/coverage/",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 10000,
        },
      );

      if (response.data?.status !== "success") {
        throw new Error(response.data?.message || "Distance check failed.");
      }

      const pct = response.data?.distance_percentage;
      const apiStatus = response.data?.distance_status as string | undefined;
      const apiMessage = response.data?.message as string | undefined;
      const detectionMethod = response.data?.detection_method as
        | string
        | undefined;

      // Frontend owns the band decision. It matches your spec exactly:
      //   pct <  60  -> too_far
      //   60-79      -> balanced
      //   pct >= 80  -> too_close
      let result: DistanceStatus = "unknown";
      if (typeof pct === "number" && Number.isFinite(pct)) {
        setDistancePercentage(pct);
        if (pct < TOO_FAR_MAX_PCT) result = "too_far";
        else if (pct >= TOO_CLOSE_MIN_PCT) result = "too_close";
        else result = "balanced";
      } else if (
        apiStatus === "too_far" ||
        apiStatus === "balanced" ||
        apiStatus === "too_close"
      ) {
        result = apiStatus;
      }
      setDistanceStatus(result);

      // "Paper not detected" is not the same as "too far".
      const paperNotDetected =
        detectionMethod === "none" ||
        (typeof pct === "number" &&
          pct === 0 &&
          typeof apiMessage === "string" &&
          apiMessage.toLowerCase().includes("not detected"));

      if (paperNotDetected) {
        Alert.alert(
          "Paper not detected",
          apiMessage ||
            "Make sure all four corners of the Braille page are inside the frame and well lit, then try again.",
        );
        return;
      }
      if (result === "too_far") {
        Alert.alert(
          "Too far",
          "Move the phone closer to the Braille paper, then try again.",
        );
        return;
      }
      if (result === "too_close") {
        Alert.alert(
          "Too close",
          "Move the phone farther back from the Braille paper, then try again.",
        );
        return;
      }
      if (result !== "balanced") {
        Alert.alert(
          "Try again",
          "Could not determine distance. Please try again.",
        );
        return;
      }

      balanced = true;
    } catch (error) {
      console.error("Failed to capture or check distance:", error);
      Alert.alert(
        "Error",
        "Could not check the camera distance. Check that the backend is running and try again.",
      );
    } finally {
      // ALWAYS clear the spinner before any awaits below. Fire-and-forget the
      // cleanup so a slow filesystem can never delay this.
      checkingDistanceRef.current = false;
      setIsCheckingDistance(false);

      if (photoUri && !balanced) {
        FileSystem.deleteAsync(photoUri, { idempotent: true }).catch(
          (error) => {
            console.error("Failed to remove rejected camera photo:", error);
          },
        );
      }
    }

    // PHASE 2: only reached when the distance check passed.
    // `isCheckingDistance` is already false here, so Retake during
    // preprocessing cannot leave the camera screen stuck.
    if (balanced && photoUri) {
      try {
        await handleCapture(photoUri);
      } catch (error) {
        console.error("Processing failed:", error);
        Alert.alert("Error", "Failed to process the photo. Please try again.");
      }
    }
  };

  const toggleFlash = () => {
    setFlashMode((mode) => {
      if (mode === "off") return "torch";
      if (mode === "torch") return "auto";
      return "off";
    });
  };

  const getFlashIcon = () => {
    if (flashMode === "off") return "flash-off-outline";
    if (flashMode === "torch") return "flashlight";
    return "flash-outline";
  };

  const getFlashColor = () => (flashMode === "off" ? "#fff" : "#FFD700");

  const getFlashLabel = () => {
    if (flashMode === "torch") return "Torch on";
    if (flashMode === "auto") return "Flash auto";
    return "Flash off";
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled) {
      await handleBatchCapture(
        result.assets.map((asset) => asset.uri).slice(0, 10),
      );
    }
  };

  const openReferencePage = () => {
    setReferenceCountdown(3);
    setShowReferencePage(true);
  };

  const confirmReferenceAndPickImage = async () => {
    if (referenceCountdown > 0) return;
    setShowReferencePage(false);
    await pickImage();
  };

  type Slide =
    | {
        id: number;
        source: { uri: string };
        uri: string;
        label: string;
        type: "image";
        photoIndex: number;
        imageRole: "original" | "processed";
      }
    | {
        id: number;
        text: string;
        label: string;
        type: "text";
        photoIndex: number;
      };

  const slides: Slide[] = image
    ? batchImageUris.flatMap((uri, photoIndex) => {
        const processedUri = batchProcessedImageUris[photoIndex];
        const outputText = batchTextOutputs[photoIndex];
        if (!processedUri || outputText === undefined) return [];
        return [
          {
            id: photoIndex * 3,
            source: { uri },
            uri,
            label: `Original photo ${photoIndex + 1}`,
            type: "image" as const,
            photoIndex,
            imageRole: "original" as const,
          },
          {
            id: photoIndex * 3 + 1,
            source: { uri: processedUri },
            uri: processedUri,
            label: `Processed image ${photoIndex + 1}`,
            type: "image" as const,
            photoIndex,
            imageRole: "processed" as const,
          },
          {
            id: photoIndex * 3 + 2,
            text: outputText,
            label: `Text output ${photoIndex + 1}`,
            type: "text" as const,
            photoIndex,
          },
        ];
      })
    : [];

  const handleSavePress = () => {
    const currentSlide = slides[currentIndex];
    if (!currentSlide) return;
    setBatchSaveMode(null);

    if (batchImageUris.length > 1) {
      setBatchSaveMode(selectedPhotoIndices.length > 0 ? "selected" : "all");
      setSaveType("text");
      setImageName(`Batch_${Date.now()}`);
      setSelectedFolder(defaultFolderId);
      setShowSaveModal(true);
      return;
    }

    const name = `${currentSlide.label.replace(/\s+/g, "_")}_${Date.now()}`;
    setImageName(name);
    setSelectedFolder(defaultFolderId);

    if (currentSlide.type === "text") {
      setSaveType("text");
      setPendingText(currentSlide.text);
      setPendingImageUri(batchImageUris[currentSlide.photoIndex] || image);
      setShowSaveModal(true);
    } else {
      setPendingImageUri(batchImageUris[currentSlide.photoIndex] || image);
      setSaveType("text");
      setPendingText(batchTextOutputs[currentSlide.photoIndex] ?? null);
      setShowSaveModal(true);
    }
  };

  const togglePhotoSelection = (photoIndex: number) => {
    setSelectedPhotoIndices((selected) =>
      selected.includes(photoIndex)
        ? selected.filter((index) => index !== photoIndex)
        : [...selected, photoIndex],
    );
  };

  const handleConfirmSave = async () => {
    if (batchSaveMode) {
      const photoIndices =
        batchSaveMode === "all"
          ? batchImageUris.map((_, index) => index)
          : selectedPhotoIndices;
      let savedCount = 0;
      for (const photoIndex of photoIndices) {
        const photoUri = batchImageUris[photoIndex];
        const outputText = batchTextOutputs[photoIndex];
        if (
          photoUri &&
          outputText !== undefined &&
          (await uploadToBackend(
            photoUri,
            selectedFolder,
            `${imageName}_Photo_${photoIndex + 1}`,
            outputText,
            batchProcessedImageUris[photoIndex],
          ))
        )
          savedCount += 1;
      }
      if (savedCount === photoIndices.length) {
        setBatchSaveMode(null);
        setShowSaveModal(false);
        Alert.alert(
          "Success",
          `${savedCount} photo and text twin${savedCount === 1 ? "" : "s"} saved!`,
          [{ text: "OK", onPress: () => router.replace("/dashboard") }],
        );
      } else {
        Alert.alert(
          "Warning",
          `${savedCount} of ${photoIndices.length} twins were saved.`,
        );
      }
    } else if (saveType === "text" && pendingText !== null) {
      const photoIndex = Math.floor(currentIndex / 3);
      const photoUri = batchImageUris[photoIndex] || image;
      const photoSaved = photoUri
        ? await uploadToBackend(
            photoUri,
            selectedFolder,
            imageName,
            pendingText,
            batchProcessedImageUris[photoIndex],
          )
        : false;
      if (photoSaved) {
        setShowSaveModal(false);
        Alert.alert("Success", "Photo and text output saved as one item!", [
          { text: "OK", onPress: () => router.replace("/dashboard") },
        ]);
      } else {
        Alert.alert(
          "Error",
          "Failed to save photo and text output. Please try again.",
        );
      }
    } else if (saveType === "image" && pendingImageUri) {
      const success = await uploadToBackend(
        pendingImageUri,
        selectedFolder,
        imageName,
      );
      if (success) {
        setShowSaveModal(false);
        Alert.alert("Success", "Image saved successfully!", [
          { text: "OK", onPress: () => router.replace("/dashboard") },
        ]);
      } else {
        Alert.alert("Error", "Failed to save image. Please try again.");
      }
    } else {
      Alert.alert("Info", "No content to save.");
    }
  };

  const handleRetake = () => {
    setImage(null);
    setBatchImageUris([]);
    setBatchProcessedImageUris([]);
    setBatchTextOutputs([]);
    setProcessingError(null);
    setPendingImageUri(null);
    setPendingText(null);
    setSelectedPhotoIndices([]);
    setBatchSaveMode(null);
    setShowButtons(false);
    setShowSaveModal(false);
    setCurrentIndex(0);
    setDewarpProgress(0);
    setDistanceStatus("unknown");
    setDistancePercentage(null);
    // Reset the checking-distance lock too, so a Retake during preprocessing
    // always brings the camera screen back clean.
    checkingDistanceRef.current = false;
    setIsCheckingDistance(false);
    stopScanAnimation();
  };

  const createNewFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert("Error", "Please enter a folder name");
      return;
    }
    try {
      const response = await AxiosInstance.post("/folders/", {
        folder_name: newFolderName,
      });
      if (response.data && response.data.folder_id) {
        const newFolder = {
          folder_id: response.data.folder_id,
          folder_name: newFolderName,
        };
        setFolders((prev) => [...prev, newFolder]);
        setSelectedFolder(response.data.folder_id);
        setNewFolderName("");
        setShowNewFolderInput(false);
        Alert.alert("Success", "Folder created");
      }
    } catch (error) {
      console.error("Failed to create folder:", error);
      Alert.alert("Error", "Failed to create folder");
    }
  };

  const renderItem = ({ item }: { item: Slide }) => (
    <View style={styles.slideContainer}>
      {item.type === "image" ? (
        <View style={styles.imageFrameWrapper}>
          <View style={styles.imageContainerInner}>
            <Animated.Image
              source={item.source}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.algorithmBadge} pointerEvents="none">
            <Ionicons name="analytics-outline" size={14} color="#fff" />
            <Text style={styles.algorithmBadgeText}>
              {item.imageRole === "original"
                ? "Original photo"
                : "Final processed image"}
            </Text>
          </View>
          <View style={styles.straightenOutline} pointerEvents="none">
            <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
            <View style={[styles.cornerBracket, styles.cornerTopRight]} />
            <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
            <View style={[styles.cornerBracket, styles.cornerBottomRight]} />
          </View>
          <View style={styles.straightenedBadge} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={styles.straightenedBadgeText}>
              {item.imageRole === "original"
                ? "Captured image"
                : "Preprocessing complete"}
            </Text>
          </View>
          {batchImageUris.length > 1 && item.imageRole === "original" ? (
            <TouchableOpacity
              style={styles.photoSelectionCheckbox}
              onPress={() => togglePhotoSelection(item.photoIndex)}
            >
              <Ionicons
                name={
                  selectedPhotoIndices.includes(item.photoIndex)
                    ? "checkbox"
                    : "square-outline"
                }
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
                            ? dewarpAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.75, 1.15],
                              })
                            : 1,
                        },
                      ],
                    },
                  ]}
                />
                <Ionicons
                  name={
                    isReadingAudioEnabled
                      ? "volume-high"
                      : "volume-mute-outline"
                  }
                  size={16}
                  color={isReadingAudioEnabled ? "#DC143C" : "#8E8E93"}
                />
                <Text style={styles.audioBadgeText}>
                  {isReadingAudioEnabled ? "Reading" : "Read aloud"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowOutputSettings(true)}
              style={styles.outputSettingsButton}
              accessibilityRole="button"
              accessibilityLabel="Open transcript display settings"
            >
              <Ionicons name="settings-outline" size={20} color="#DC143C" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setIsReadingAudioEnabled((enabled) => !enabled)}
              style={[
                styles.audioToggleButton,
                isReadingAudioEnabled && styles.audioToggleButtonActive,
              ]}
            >
              <Ionicons
                name={isReadingAudioEnabled ? "toggle" : "toggle-outline"}
                size={18}
                color={isReadingAudioEnabled ? "#fff" : "#DC143C"}
              />
              <Text
                style={[
                  styles.audioToggleText,
                  isReadingAudioEnabled && styles.audioToggleTextActive,
                ]}
              >
                {isReadingAudioEnabled ? "On" : "Off"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.textScrollContent}>
            <Text
              style={[
                styles.translatedText,
                {
                  fontSize: 14 * fontScale,
                  lineHeight: 22 * fontScale,
                  fontWeight: fontWeight.toString() as
                    | "400"
                    | "500"
                    | "600"
                    | "700"
                    | "800",
                  color: theme.text,
                },
              ]}
              selectable
            >
              {item.text}
            </Text>
            {isReadingAudioEnabled ? (
              <View style={styles.readingProgressPulse} />
            ) : null}
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
        <TouchableOpacity
          onPress={requestPermission}
          style={styles.permissionButton}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (image) {
    return (
      <View style={styles.previewContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Braille Processing Results</Text>
        </View>

        {isScanning ? (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: image }}
              style={styles.fullImagePreview}
              resizeMode="cover"
            />
            <View style={styles.scanningOverlay}>
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    transform: [
                      {
                        translateY: scanAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-height / 2.5, height / 2.5],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Text style={styles.scanningText}>
                Processing Braille paper...
              </Text>
              <Text style={styles.scanningSubText}>
                Running preprocessing and transcription models
              </Text>
              <View style={styles.progressContainer}>
                <View
                  style={[styles.progressBar, { width: `${dewarpProgress}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{dewarpProgress}%</Text>
            </View>
          </View>
        ) : processingError ? (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: image }}
              style={styles.fullImagePreview}
              resizeMode="contain"
            />
            <View style={styles.scanningOverlay}>
              <Ionicons name="alert-circle-outline" size={40} color="#fff" />
              <Text style={styles.scanningText}>Braille processing failed</Text>
              <Text style={styles.scanningSubText}>{processingError}</Text>
              <View style={styles.twoButtonsContainer}>
                <TouchableOpacity
                  style={styles.saveButtonLarge}
                  onPress={() => processCapturedPhotos(batchImageUris)}
                >
                  <Text style={[styles.buttonLargeText, { color: "#fff" }]}>
                    Retry
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.retakeButtonLarge}
                  onPress={handleRetake}
                >
                  <Text style={styles.buttonLargeText}>Retake</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : showButtons ? (
          <View style={styles.carouselWrapper}>
            <FlatList<Slide>
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
            <View style={styles.counterContainer}>
              <Text style={styles.counterText}>
                {slides[currentIndex]?.label}
                {"  "}
                {currentIndex + 1} / {slides.length}
              </Text>
            </View>
            <View style={styles.twoButtonsContainer}>
              <TouchableOpacity
                style={styles.saveButtonLarge}
                onPress={handleSavePress}
              >
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={[styles.buttonLargeText, { color: "#fff" }]}>
                  {batchImageUris.length > 1 ? "Save All" : "Save"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.retakeButtonLarge}
                onPress={handleRetake}
              >
                <Ionicons name="camera-outline" size={18} color="#E53935" />
                <Text style={styles.buttonLargeText}>Retake</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

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
                  {batchSaveMode
                    ? "Save Batch Twins"
                    : saveType === "text"
                      ? "Save Photo and Output"
                      : "Save Image"}
                </Text>
                <TouchableOpacity onPress={() => setShowSaveModal(false)}>
                  <Ionicons name="close" size={24} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              <View style={styles.inputWithIcon}>
                <Text style={styles.inputLabel}>
                  {saveType === "text" ? "File Name" : "Image Name"}
                </Text>
                <TouchableOpacity
                  onPress={() => setImageName("")}
                  style={styles.editIcon}
                >
                  <Ionicons name="create-outline" size={20} color="#DC143C" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder={
                  saveType === "text" ? "Enter file name" : "Enter image name"
                }
                placeholderTextColor="#C7C7CC"
                value={imageName}
                onChangeText={setImageName}
              />
              {saveType === "text" && (
                <Text style={styles.fileExtensionHint}>
                  .txt will be added automatically
                </Text>
              )}
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
              <ScrollView
                style={styles.folderList}
                showsVerticalScrollIndicator={false}
              >
                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.folder_id}
                    style={[
                      styles.folderOption,
                      selectedFolder === folder.folder_id &&
                        styles.folderOptionSelected,
                    ]}
                    onPress={() => setSelectedFolder(folder.folder_id)}
                  >
                    <View style={styles.folderLeft}>
                      <Text style={styles.folderIcon}>📁</Text>
                      <Text style={styles.folderName}>
                        {folder.folder_name}
                      </Text>
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
                          name={
                            defaultFolderId === folder.folder_id
                              ? "star"
                              : "star-outline"
                          }
                          size={20}
                          color={
                            defaultFolderId === folder.folder_id
                              ? "#FFD700"
                              : "#C7C7CC"
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {defaultFolderId ? (
                <View style={styles.defaultInfo}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={styles.defaultInfoText}>
                    Default:{" "}
                    {folders.find((f) => f.folder_id === defaultFolderId)
                      ?.folder_name ?? ""}
                  </Text>
                </View>
              ) : null}
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
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
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
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={createNewFolder}
                >
                  <Text style={styles.saveButtonText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={showOutputSettings}
          transparent
          animationType="fade"
          onRequestClose={() => setShowOutputSettings(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: theme.background },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Transcript Display
                </Text>
                <TouchableOpacity
                  onPress={() => setShowOutputSettings(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close transcript display settings"
                >
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.outputSettingsLabel, { color: theme.text }]}>
                Font Size
              </Text>
              <View style={styles.outputSettingsValueRow}>
                <Text
                  style={[
                    styles.outputSettingsRangeText,
                    { color: theme.textMuted },
                  ]}
                >
                  Small
                </Text>
                <Text
                  style={[styles.outputSettingsValue, { color: theme.accent }]}
                >
                  {Math.round(fontScale * 100)}%
                </Text>
                <Text
                  style={[
                    styles.outputSettingsRangeText,
                    { color: theme.textMuted },
                  ]}
                >
                  Large
                </Text>
              </View>
              <Slider
                style={styles.outputSettingsSlider}
                minimumValue={0.8}
                maximumValue={1.5}
                step={0.05}
                value={fontScale}
                onValueChange={setFontScale}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.border}
                thumbTintColor={theme.accent}
              />

              <Text style={[styles.outputSettingsLabel, { color: theme.text }]}>
                Font Weight
              </Text>
              <View style={styles.outputSettingsValueRow}>
                <Text
                  style={[
                    styles.outputSettingsRangeText,
                    { color: theme.textMuted },
                  ]}
                >
                  Default
                </Text>
                <Text
                  style={[styles.outputSettingsValue, { color: theme.accent }]}
                >
                  {fontWeight === 400
                    ? "Default"
                    : fontWeight === 500
                      ? "Medium"
                      : fontWeight === 600
                        ? "Semi Bold"
                        : fontWeight === 700
                          ? "Bold"
                          : "Extra Bold"}
                </Text>
                <Text
                  style={[
                    styles.outputSettingsRangeText,
                    { color: theme.textMuted },
                  ]}
                >
                  Extra Bold
                </Text>
              </View>
              <Slider
                style={styles.outputSettingsSlider}
                minimumValue={400}
                maximumValue={800}
                step={100}
                value={fontWeight}
                onValueChange={setFontWeight}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.border}
                thumbTintColor={theme.accent}
              />

              <Text
                style={[
                  styles.outputSettingsPreview,
                  {
                    color: theme.text,
                    fontSize: 14 * fontScale,
                    fontWeight: fontWeight.toString() as
                      | "400"
                      | "500"
                      | "600"
                      | "700"
                      | "800",
                  },
                ]}
              >
                Braille transcription preview
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  const cameraHeight = Math.round(width * (4 / 3));
  const headerHeight = 100;
  const bottomControlsHeight = 110;
  const availableHeight = height - headerHeight - bottomControlsHeight;
  const finalCameraHeight = Math.min(cameraHeight, availableHeight);
  const finalCameraWidth = Math.round(finalCameraHeight * (3 / 4));
  const bandHeight = Math.max(0, (availableHeight - finalCameraHeight) / 2);

  const canCapture = ENABLE_LIVE_DISTANCE_POLLING
    ? distanceStatus === "balanced" && isLevel && !isCheckingDistance
    : isLevel && !isCheckingDistance;

  const readiness = (() => {
    if (isCheckingDistance) {
      return {
        icon: "hourglass-outline" as const,
        color: "rgba(0,0,0,0.65)",
        text: "Checking distance…",
      };
    }
    if (!ENABLE_LIVE_DISTANCE_POLLING) {
      if (!isLevel) {
        return {
          icon: "move-outline" as const,
          color: "rgba(0,0,0,0.65)",
          text: "Tilt phone flat to capture",
        };
      }
      if (distanceStatus === "too_far") {
        return {
          icon: "arrow-up-circle" as const,
          color: "rgba(255,165,0,0.95)",
          text: "Too far — move closer",
        };
      }
      if (distanceStatus === "too_close") {
        return {
          icon: "arrow-down-circle" as const,
          color: "rgba(220,20,60,0.95)",
          text: "Too close — move back",
        };
      }
      if (distanceStatus === "balanced") {
        return {
          icon: "checkmark-circle" as const,
          color: "rgba(0,200,83,0.95)",
          text: "Balanced — tap to capture",
        };
      }
      return {
        icon: "camera-outline" as const,
        color: "rgba(0,0,0,0.65)",
        text: "Level — tap to check distance",
      };
    }

    if (distanceStatus === "too_far") {
      return {
        icon: "arrow-up-circle" as const,
        color: "rgba(255,165,0,0.95)",
        text: "Too far — move closer",
      };
    }
    if (distanceStatus === "too_close") {
      return {
        icon: "arrow-down-circle" as const,
        color: "rgba(220,20,60,0.95)",
        text: "Too close — move back",
      };
    }
    if (distanceStatus === "balanced" && !isLevel) {
      return {
        icon: "move-outline" as const,
        color: "rgba(255,165,0,0.9)",
        text: "Balanced — tilt phone flat",
      };
    }
    if (distanceStatus === "balanced" && isLevel) {
      return {
        icon: "checkmark-circle" as const,
        color: "rgba(0,200,83,0.95)",
        text: "Balanced & level — ready",
      };
    }
    return {
      icon: "ellipsis-horizontal" as const,
      color: "rgba(0,0,0,0.65)",
      text: "Measuring distance…",
    };
  })();

  const renderZone = (
    boxStyle: any,
    labelStyle: any,
    labelText: string,
    active: boolean,
    activeColor: string,
  ) => {
    const color = active ? activeColor : "rgba(255,255,255,0.4)";
    const labelColor = active ? activeColor : "rgba(255,255,255,0.55)";
    return (
      <View style={boxStyle}>
        <View
          style={[styles.zoneCorner, styles.cornerTl, { borderColor: color }]}
        />
        <View
          style={[styles.zoneCorner, styles.cornerTr, { borderColor: color }]}
        />
        <View
          style={[styles.zoneCorner, styles.cornerBl, { borderColor: color }]}
        />
        <View
          style={[styles.zoneCorner, styles.cornerBr, { borderColor: color }]}
        />
        <Text style={[labelStyle, { color: labelColor }]}>{labelText}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Braille Scanner</Text>
      </View>

      <View style={[styles.scopeBand, { height: Math.max(bandHeight, 44) }]}>
        <View style={styles.scopeBandContent}>
          <View style={styles.scopeIndicatorDot} />
          <Text style={styles.scopeBandText}>Outside capture area</Text>
          <View style={styles.scopeIndicatorDot} />
        </View>
      </View>

      <View
        style={[
          styles.cameraWrapper,
          {
            width: finalCameraWidth,
            height: finalCameraHeight,
            alignSelf: "center",
          },
        ]}
      >
        <CameraView
          ref={cameraRef}
          style={{ width: finalCameraWidth, height: finalCameraHeight }}
          facing="back"
          flash={flashMode === "torch" ? "off" : flashMode}
          enableTorch={flashMode === "torch"}
        />

        {/* Distance zone guides — only render the active zone to prevent overlapping brackets */}
        <View style={styles.zoneOverlay} pointerEvents="none">
          {/* Show TOO CLOSE guide only when actually too close */}
          {distanceStatus === "too_close" &&
            renderZone(
              styles.tooCloseBox,
              styles.tooCloseLabel,
              "TOO CLOSE",
              true,
              "#DC143C",
            )}

          {/* Show BALANCED guide when active OR as the default target before checking */}
          {(distanceStatus === "balanced" || distanceStatus === "unknown") &&
            renderZone(
              styles.balancedBox,
              styles.balancedLabel,
              "BALANCED",
              distanceStatus === "balanced",
              "#00C853",
            )}

          {/* Show TOO FAR guide only when actually too far */}
          {distanceStatus === "too_far" &&
            renderZone(
              styles.tooFarBox,
              styles.tooFarLabel,
              "TOO FAR",
              true,
              "#FFA500",
            )}
        </View>

        <View style={styles.levelOverlay} pointerEvents="none">
          <View
            style={[
              styles.levelBracket,
              styles.levelTopLeft,
              { borderColor: isLevel ? "#00FF00" : "#ffffff" },
            ]}
          />
          <View
            style={[
              styles.levelBracket,
              styles.levelTopRight,
              { borderColor: isLevel ? "#00FF00" : "#ffffff" },
            ]}
          />
          <View
            style={[
              styles.levelBracket,
              styles.levelBottomLeft,
              { borderColor: isLevel ? "#00FF00" : "#ffffff" },
            ]}
          />
          <View
            style={[
              styles.levelBracket,
              styles.levelBottomRight,
              { borderColor: isLevel ? "#00FF00" : "#ffffff" },
            ]}
          />

          <View style={styles.levelCrosshairContainer}>
            <Animated.View
              style={[
                styles.levelCrosshair,
                {
                  transform: [
                    { translateX: tilt.x * 200 },
                    { translateY: tilt.y * 200 },
                  ],
                },
              ]}
            />
          </View>

          <View
            style={[
              styles.levelStatusPill,
              { backgroundColor: readiness.color },
            ]}
          >
            <Ionicons name={readiness.icon} size={16} color="#fff" />
            <Text style={styles.levelStatusText}>{readiness.text}</Text>
          </View>

          {distancePercentage !== null && (
            <View style={styles.distancePercentBadge}>
              <Text style={styles.distancePercentText}>
                {Math.round(distancePercentage)}%
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cameraOverlay} pointerEvents="none">
          <Text style={styles.overlayText}>
            Position Braille paper in frame
          </Text>
        </View>
      </View>

      <View style={[styles.scopeBand, { height: Math.max(bandHeight, 44) }]}>
        <View style={styles.scopeBandContent}>
          <View style={styles.scopeIndicatorDot} />
          <Text style={styles.scopeBandText}>Outside capture area</Text>
          <View style={styles.scopeIndicatorDot} />
        </View>
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={openReferencePage}
        >
          <Ionicons name="images-outline" size={28} color="#fff" />
          <Text style={styles.galleryText}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureButton, { opacity: canCapture ? 1 : 0.4 }]}
          onPress={takePicture}
          disabled={!canCapture}
          accessibilityLabel="Take picture"
          accessibilityState={{ disabled: !canCapture }}
        >
          {isCheckingDistance ? (
            <ActivityIndicator size="small" color="#DC143C" />
          ) : (
            <View
              style={[
                styles.captureButtonInner,
                canCapture && styles.captureButtonInnerReady,
              ]}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.flashButton}
          onPress={toggleFlash}
          accessibilityRole="button"
          accessibilityLabel={getFlashLabel()}
        >
          <Ionicons name={getFlashIcon()} size={24} color={getFlashColor()} />
          <Text style={styles.flashText}>
            {flashMode === "torch"
              ? "Torch"
              : flashMode === "auto"
                ? "Auto"
                : "Off"}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showReferencePage}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReferencePage(false)}
      >
        <View style={styles.referenceModalOverlay}>
          <View style={styles.referenceModalContent}>
            {/* <View style={styles.referenceHeader}>
              <View style={styles.referenceHeaderSpacer} />
              <Text style={styles.headerTitle}>Photo Capture Guide</Text>
              <TouchableOpacity
                onPress={() => setShowReferencePage(false)}
                style={styles.referenceCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close photo capture guide"
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View> */}
            <Text style={styles.referenceTitle}>For a clear Braille scan</Text>
            <Text style={styles.referenceDescription}>
              Review this guide before choosing your photo.
            </Text>
            <Image
              source={require("../assets/images/reference.jpg")}
              style={styles.referenceImage}
              resizeMode="contain"
              accessibilityLabel="Guide showing correct and incorrect ways to capture Braille paper"
            />
            <TouchableOpacity
              style={[
                styles.referenceConfirmButton,
                referenceCountdown > 0 && styles.referenceConfirmButtonDisabled,
              ]}
              onPress={confirmReferenceAndPickImage}
              disabled={referenceCountdown > 0}
              accessibilityRole="button"
            >
              <Text style={styles.referenceConfirmButtonText}>
                {referenceCountdown > 0
                  ? `I Understand (${referenceCountdown})`
                  : "I Understand"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  referenceModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  referenceModalContent: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    overflow: "hidden",
  },
  referenceHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#DC143C",
  },
  referenceHeaderSpacer: { width: 40 },
  referenceCloseButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  referenceTitle: {
    marginTop: 18,
    paddingHorizontal: 20,
    color: "#222",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  referenceDescription: {
    marginTop: 6,
    paddingHorizontal: 20,
    color: "#666",
    fontSize: 14,
    textAlign: "center",
  },
  referenceImage: {
    width: "100%",
    height: height * 0.45,
    marginVertical: 10,
  },
  referenceConfirmButton: {
    minHeight: 52,
    width: "88%",
    marginBottom: 18,
    borderRadius: 12,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
  },
  referenceConfirmButtonDisabled: { backgroundColor: "#9e9e9e" },
  referenceConfirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: 5,
    paddingHorizontal: 20,
    backgroundColor: "#DC143C",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  scopeBand: {
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  scopeBandContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  scopeIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  scopeBandText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cameraWrapper: { overflow: "hidden", position: "relative" },
  cameraOverlay: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  overlayText: {
    color: "#fff",
    fontSize: 13,
    opacity: 0.9,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  bottomControls: {
    height: 110,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 30,
    backgroundColor: "#000",
  },
  galleryButton: { alignItems: "center" },
  galleryText: { color: "#fff", fontSize: 11, marginTop: 4 },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#fff",
  },
  captureButtonInnerReady: { borderColor: "#00C853", borderWidth: 4 },
  flashButton: {
    width: 44,
    minHeight: 54,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  flashText: { color: "#fff", fontSize: 10, fontWeight: "600" },

  levelOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  levelBracket: {
    position: "absolute",
    width: 26,
    height: 26,
    borderColor: "#fff",
  },
  levelTopLeft: {
    top: 14,
    left: 14,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  levelTopRight: {
    top: 14,
    right: 14,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  levelBottomLeft: {
    bottom: 14,
    left: 14,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  levelBottomRight: {
    bottom: 14,
    right: 14,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },
  levelCrosshairContainer: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
  },
  levelCrosshair: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  levelStatusPill: {
    position: "absolute",
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    maxWidth: "90%",
  },
  levelStatusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  distancePercentBadge: {
    position: "absolute",
    top: 56,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distancePercentText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  zoneOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tooFarBox: {
    position: "absolute",
    top: "20%",
    bottom: "20%",
    left: "18%",
    right: "18%",
  },
  tooFarLabel: {
    position: "absolute",
    top: -22,
    left: 0,
    color: "#FFA500",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  balancedBox: {
    position: "absolute",
    top: "10%",
    bottom: "10%",
    left: "8%",
    right: "8%",
  },
  balancedLabel: {
    position: "absolute",
    top: -22,
    left: 0,
    color: "#00C853",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tooCloseBox: {
    position: "absolute",
    top: "3%",
    bottom: "3%",
    left: "2%",
    right: "2%",
  },
  tooCloseLabel: {
    position: "absolute",
    bottom: -22,
    left: 0,
    color: "#DC143C",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  zoneCorner: {
    position: "absolute",
    width: 22,
    height: 22,
  },
  cornerTl: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  cornerTr: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  cornerBl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  cornerBr: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },

  previewContainer: { flex: 1, backgroundColor: "#fff" },
  imageContainer: { flex: 1, position: "relative", backgroundColor: "#000" },
  fullImagePreview: {
    width: width - 20,
    height: height * 0.6,
    alignSelf: "center",
    marginTop: 10,
    borderRadius: 8,
  },
  carouselWrapper: { flex: 1, backgroundColor: "#ffffff" },
  slideContainer: {
    width: width,
    alignItems: "center",
    justifyContent: "center",
  },
  imageFrameWrapper: {
    width: width - 20,
    height: height * 0.7,
    borderRadius: 8,
    position: "relative",
    backgroundColor: "#fff",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainerInner: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  fullImage: { width: "100%", height: "100%", borderRadius: 0 },
  photoSelectionCheckbox: {
    position: "absolute",
    right: 16,
    bottom: 16,
    padding: 7,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  straightenOutline: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    borderWidth: 2,
    borderColor: "#ffffff",
    borderRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  cornerBracket: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "#DC143C",
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
    position: "absolute",
    top: 28,
    right: 28,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  straightenedBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  algorithmBadge: {
    position: "absolute",
    top: 28,
    left: 28,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(220, 20, 60, 0.85)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  algorithmBadgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  textContainer: {
    width: width - 40,
    height: height * 0.7,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 16,
    paddingTop: 16,
    gap: 12,
  },
  textHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textHeaderLeft: { flex: 1 },
  outputSettingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DC143C",
  },
  textAudioBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    backgroundColor: "#F7F7F7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  audioWave: {
    width: 4,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#DC143C",
  },
  audioBadgeText: { fontSize: 12, fontWeight: "600", color: "#1A1A1A" },
  audioToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#DC143C",
    backgroundColor: "#fff",
  },
  audioToggleButtonActive: { backgroundColor: "#DC143C" },
  audioToggleText: { fontSize: 12, fontWeight: "700", color: "#DC143C" },
  audioToggleTextActive: { color: "#fff" },
  textScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  translatedText: {
    fontSize: 14,
    color: "#333",
    fontFamily: "monospace",
    lineHeight: 22,
    textAlign: "center",
  },
  outputSettingsLabel: { fontSize: 14, fontWeight: "600", marginTop: 16 },
  outputSettingsValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  outputSettingsRangeText: { fontSize: 12 },
  outputSettingsValue: { fontSize: 14, fontWeight: "700" },
  outputSettingsSlider: { width: "100%", height: 40 },
  outputSettingsPreview: {
    textAlign: "center",
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  readingWordActive: {
    backgroundColor: "rgba(220, 20, 60, 0.18)",
    color: "#000",
    textShadowColor: "rgba(220, 20, 60, 0.35)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  readingProgressPulse: {
    marginTop: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(220, 20, 60, 0.35)",
    overflow: "hidden",
  },
  counterContainer: {
    alignSelf: "center",
    marginVertical: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  counterText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  twoButtonsContainer: {
    flexDirection: "row",
    paddingHorizontal: 5,
    paddingBottom: 30,
    paddingTop: 10,
    gap: 16,
    marginHorizontal: 5,
  },
  saveButtonLarge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    borderRadius: 8,
    gap: 6,
  },
  retakeButtonLarge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#E53935",
    paddingVertical: 14,
    borderRadius: 8,
    gap: 6,
  },
  buttonLargeText: { color: "#333", fontSize: 13, fontWeight: "500" },
  scanningOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#DC143C",
    width: "100%",
  },
  scanningText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 20,
    fontWeight: "600",
  },
  scanningSubText: { color: "#ccc", fontSize: 12, marginTop: 4 },
  progressContainer: {
    width: "80%",
    height: 8,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 4,
    marginTop: 12,
    overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: "#DC143C", borderRadius: 4 },
  progressText: {
    color: "#fff",
    fontSize: 14,
    marginTop: 8,
    fontWeight: "500",
  },
  dewarpOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  dewarpGrid: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "column",
    justifyContent: "space-around",
    padding: 20,
  },
  gridLine: {
    height: 1,
    backgroundColor: "rgba(220, 20, 60, 0.3)",
    width: "100%",
  },
  dewarpStatus: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
    borderRadius: 12,
  },
  dewarpText: { color: "#fff", fontSize: 16, marginTop: 12, fontWeight: "600" },
  dewarpSubText: { color: "#ccc", fontSize: 12, marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "600", color: "#1A1A1A" },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 12,
  },
  inputLabel: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  editIcon: { padding: 4 },
  addFolderIcon: { padding: 4, position: "relative" },
  addFolderBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
  },
  newFolderModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  newFolderModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    width: "86%",
  },
  newFolderInput: {
    borderWidth: 1,
    borderColor: "#D1D1D6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#1A1A1A",
    fontSize: 15,
  },
  newFolderModalButtons: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: "#1A1A1A",
  },
  fileExtensionHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 4,
    marginLeft: 4,
  },
  folderList: { maxHeight: 250, marginTop: 8 },
  folderOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  folderOptionSelected: { backgroundColor: "#F8F8F8" },
  folderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  folderIcon: { fontSize: 20 },
  folderName: { fontSize: 15, color: "#1A1A1A" },
  folderRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  starButton: { padding: 4 },
  defaultInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: "#FDF5E6",
    borderRadius: 8,
  },
  defaultInfoText: { fontSize: 12, color: "#8E8E93" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButton: { backgroundColor: "#F5F5F5" },
  cancelButtonText: { color: "#8E8E93", fontSize: 16, fontWeight: "500" },
  saveButton: { backgroundColor: "#DC143C" },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  message: { color: "#fff", fontSize: 16, textAlign: "center", marginTop: 50 },
  permissionButton: {
    backgroundColor: "#DC143C",
    padding: 15,
    borderRadius: 10,
    margin: 20,
    alignItems: "center",
  },
  permissionButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
