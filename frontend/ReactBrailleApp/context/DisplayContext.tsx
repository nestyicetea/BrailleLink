import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

const SETTINGS_KEYS = {
  FONT_SCALE: 'font_scale',
  FONT_WEIGHT: 'font_weight',
  COLOR_MODE: 'color_mode',
};

export type ColorMode = 'light' | 'dark' | 'system' | 'sepia';

export const THEMES = {
  light: {
    background: '#FFFFFF',
    surface: '#F8F8F8',
    text: '#1A1A1A',
    textMuted: '#8E8E93',
    border: '#E5E5EA',
    accent: '#DC143C',
    highlight: 'rgba(220, 20, 60, 0.18)',
  },
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    text: '#F2F2F2',
    textMuted: '#9A9A9A',
    border: '#2C2C2C',
    accent: '#FF4D6D',
    highlight: 'rgba(255, 77, 109, 0.28)',
  },
  sepia: {
    background: '#F4ECD8',
    surface: '#EDE3CC',
    text: '#3B2F2F',
    textMuted: '#7A6A5A',
    border: '#D9CBB0',
    accent: '#A0522D',
    highlight: 'rgba(160, 82, 45, 0.22)',
  },
};

type DisplayContextType = {
  fontScale: number;
  fontWeight: number;
  colorMode: ColorMode;
  theme: typeof THEMES.light;
  setFontScale: (v: number) => void;
  setFontWeight: (v: number) => void;
  setColorMode: (v: ColorMode) => void;
};

const DisplayContext = createContext<DisplayContextType>({
  fontScale: 1.0,
  fontWeight: 400,
  colorMode: 'system',
  theme: THEMES.light,
  setFontScale: () => {},
  setFontWeight: () => {},
  setColorMode: () => {},
});

export function DisplayProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [fontScale, setFontScaleState] = useState(1.0);
  const [fontWeight, setFontWeightState] = useState(400);
  const [colorMode, setColorModeState] = useState<ColorMode>('light');

  useEffect(() => {
    (async () => {
      const [s, w, c] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEYS.FONT_SCALE),
        AsyncStorage.getItem(SETTINGS_KEYS.FONT_WEIGHT),
        AsyncStorage.getItem(SETTINGS_KEYS.COLOR_MODE),
      ]);
      if (s) setFontScaleState(parseFloat(s));
      if (w) setFontWeightState(parseInt(w, 10));
      if (c) setColorModeState(c as ColorMode);
    })();
  }, []);

  const setFontScale = (v: number) => {
    setFontScaleState(v);
    AsyncStorage.setItem(SETTINGS_KEYS.FONT_SCALE, v.toString());
  };

  const setFontWeight = (v: number) => {
    setFontWeightState(v);
    AsyncStorage.setItem(SETTINGS_KEYS.FONT_WEIGHT, v.toString());
  };

  const setColorMode = (v: ColorMode) => {
    setColorModeState(v);
    AsyncStorage.setItem(SETTINGS_KEYS.COLOR_MODE, v);
  };

  const resolvedMode: 'light' | 'dark' | 'sepia' =
    colorMode === 'system'
      ? (systemScheme === 'dark' ? 'dark' : 'light')
      : colorMode;

  const theme = THEMES[resolvedMode];

  return (
    <DisplayContext.Provider
      value={{
        fontScale,
        fontWeight,
        colorMode,
        theme,
        setFontScale,
        setFontWeight,
        setColorMode,
      }}
    >
      {children}
    </DisplayContext.Provider>
  );
}

export const useDisplay = () => useContext(DisplayContext);