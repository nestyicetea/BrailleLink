import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

const API_KEY = process.env.EXPO_PUBLIC_AZURE_TTS_KEY ?? '';
const REGION = process.env.EXPO_PUBLIC_AZURE_TTS_REGION ?? 'australiaeast';
const CUSTOM_ENDPOINT = process.env.EXPO_PUBLIC_AZURE_TTS_ENDPOINT ?? '';
const VOICE = 'fil-PH-BlessicaNeural';

let azureAvailable = true;
let lastAzureFailTime = 0;
const AZURE_RETRY_INTERVAL_MS = 30_000; // retry Azure after 30s

export interface WordTimestamp {
  word: string;
  offsetMs: number;
  durationMs: number;
}

export interface AzureTtsResult {
  audioUri: string | null;
  wordTimestamps: WordTimestamp[];
  totalMs: number;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function estimateWordTimestamps(text: string, totalMs: number): WordTimestamp[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  
  // Don't compress timing - use full duration
  const effectiveTotalMs = totalMs;
  
  const charCounts = words.map(w => Math.max(1, w.replace(/\W/g, '').length));
  const totalChars = charCounts.reduce((a, b) => a + b, 0);
  
  // Calculate pause weights for punctuation (relative, not fixed)
  const pauseWeights = words.map(word => {
    // Check if word ends with punctuation
    if (word.endsWith(',')) return 1.5; // 50% more time for comma
    if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) return 2.0; // Double time for sentence end
    if (word.endsWith(';') || word.endsWith(':')) return 1.75; // 75% more time
    return 1.0; // Normal timing
  });
  
  // Calculate weighted durations
  const weightedCounts = words.map((word, i) => charCounts[i] * pauseWeights[i]);
  const totalWeightedCount = weightedCounts.reduce((a, b) => a + b, 0);
  
  const timestamps: WordTimestamp[] = [];
  let cursor = 0;
  words.forEach((word, i) => {
    const duration = (weightedCounts[i] / totalWeightedCount) * effectiveTotalMs;
    timestamps.push({ 
      word, 
      offsetMs: cursor, 
      durationMs: duration 
    });
    cursor += duration;
  });
  return timestamps;
}

function fallbackResult(text: string): AzureTtsResult {
  const totalMs = Math.max(2000, text.replace(/\s/g, '').length * 100);
  return { audioUri: null, wordTimestamps: estimateWordTimestamps(text, totalMs), totalMs };
}

function getTtsEndpoint(): string {
  if (CUSTOM_ENDPOINT) {
    return `${CUSTOM_ENDPOINT.replace(/\/$/, '')}/tts/cognitiveservices/v1`;
  }
  return `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

export async function synthesizeSpeech(text: string): Promise<AzureTtsResult> {
  // Reset azureAvailable if enough time has passed since last failure
  if (!azureAvailable && Date.now() - lastAzureFailTime > AZURE_RETRY_INTERVAL_MS) {
    azureAvailable = true;
  }

  if (!API_KEY || !azureAvailable) {
    return fallbackResult(text);
  }

  try {
    const endpoint = getTtsEndpoint();
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fil-PH"><voice name="${VOICE}">${escapeXml(text)}</voice></speak>`;

    console.log('Azure TTS endpoint:', endpoint);

    const audioResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': API_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      },
      body: ssml,
    });

    if (!audioResponse.ok) {
      console.warn(`Azure TTS ${audioResponse.status} — using expo-speech fallback`);
      azureAvailable = false;
      lastAzureFailTime = Date.now();
      return fallbackResult(text);
    }

    const audioBytes = await audioResponse.arrayBuffer();
    const audioUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(audioUri, arrayBufferToBase64(audioBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Estimate duration from MP3 size: ~96kbps = 12000 bytes/sec
    const totalMs = Math.max(2000, (audioBytes.byteLength / 12000) * 1000);

    return { audioUri, wordTimestamps: estimateWordTimestamps(text, totalMs), totalMs };
  } catch (err) {
    console.warn('Azure TTS exception:', err);
    azureAvailable = false;
    lastAzureFailTime = Date.now();
    return fallbackResult(text);
  }
}

export async function playWithHighlights(
  audioUri: string | null,
  wordTimestamps: WordTimestamp[],
  totalMs: number,
  onWord: (index: number) => void,
  onDone: () => void,
  fallbackText?: string,
  startFromMs = 0,
): Promise<() => void> {
  const startTime = Date.now() - startFromMs;
  let lastIdx = -1;
  let stopped = false;

  // Balanced offset for better sync
  const SYNC_OFFSET = -300;

  const intervalId = setInterval(() => {
    if (stopped) return;
    const elapsed = Date.now() - startTime + SYNC_OFFSET;
    if (elapsed > totalMs + 800) {
      stopped = true;
      clearInterval(intervalId);
      onDone();
      return;
    }
    let currentIdx = -1;
    for (let i = wordTimestamps.length - 1; i >= 0; i--) {
      if (elapsed >= wordTimestamps[i].offsetMs) { currentIdx = i; break; }
    }
    if (currentIdx !== lastIdx) {
      lastIdx = currentIdx;
      if (currentIdx >= 0) onWord(currentIdx);
    }
  }, 25); // Balanced update frequency (25ms)

  if (audioUri) {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {}
    const player = createAudioPlayer({ uri: audioUri });
    // Seek to resume position if needed
    if (startFromMs > 0) {
      player.seekTo(startFromMs / 1000);
    }
    player.addListener('playbackStatusUpdate', (status: any) => {
      if (stopped) return;
      if (status.didJustFinish) {
        stopped = true;
        clearInterval(intervalId);
        onDone();
        try { player.remove(); } catch {}
      }
    });
    player.play();
    return () => {
      stopped = true;
      clearInterval(intervalId);
      try { player.pause(); player.remove(); } catch {}
    };
  }

  // expo-speech fallback — resume by splitting text from the paused word
  Speech.stop();
  const words = fallbackText ? fallbackText.split(/\s+/).filter(Boolean) : [];
  let resumeWord = 0;
  if (startFromMs > 0 && wordTimestamps.length > 0) {
    for (let i = wordTimestamps.length - 1; i >= 0; i--) {
      if (startFromMs >= wordTimestamps[i].offsetMs) { resumeWord = i; break; }
    }
  }
  const resumeText = words.slice(resumeWord).join(' ');

  if (resumeText) {
    Speech.speak(resumeText, {
      language: 'fil-PH',
      rate: 0.9,
      onDone: () => { if (!stopped) { stopped = true; clearInterval(intervalId); onDone(); } },
      onStopped: () => { if (!stopped) { stopped = true; clearInterval(intervalId); onDone(); } },
      onError: () => {
        Speech.speak(resumeText, {
          rate: 0.9,
          onDone: () => { if (!stopped) { stopped = true; clearInterval(intervalId); onDone(); } },
        });
      },
    });
  }

  return () => {
    stopped = true;
    clearInterval(intervalId);
    Speech.stop();
  };
}
