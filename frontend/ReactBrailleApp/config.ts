// config.ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
	throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
}

// Helper to get full image URL
export const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${API_BASE_URL.replace('/api', '')}${cleanPath}`;
};

export { API_BASE_URL };