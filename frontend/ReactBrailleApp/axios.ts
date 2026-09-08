// Use require to guarantee CJS resolution — Metro can return undefined
// for default imports from packages with complex export maps
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios/lib/axios');
import { API_BASE_URL, getImageUrl } from './config';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use((response: any) => {
  if (response.data?.images && Array.isArray(response.data.images)) {
    response.data.images = response.data.images.map((img: any) => ({
      ...img,
      image_url: getImageUrl(img.image_path),
      is_text: img.image_path?.endsWith('.txt') || false,
    }));
  }
  if (response.data?.image_path) {
    response.data.image_url = getImageUrl(response.data.image_path);
  }
  if (response.data?.data?.image_path) {
    response.data.data.image_url = getImageUrl(response.data.data.image_path);
  }
  return response;
}, (error: any) => {
  console.error('API Error:', error.response?.data || error.message);
  return Promise.reject(error);
});

export default api;
