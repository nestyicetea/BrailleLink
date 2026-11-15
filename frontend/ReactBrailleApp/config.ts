// config.ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
}

// Helper to get full image URL
export const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  
  // 1. If it's already a full URL, return it (Good for Supabase later)
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // 2. Ensure the path starts with a slash
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  // 3. Safely remove '/api' and any trailing slashes from the base URL
  const rootUrl = API_BASE_URL.replace(/\/api\/?$/, '');
  
  // 4. Return the combined URL
  return `${rootUrl}${cleanPath}`;
};

export { API_BASE_URL };