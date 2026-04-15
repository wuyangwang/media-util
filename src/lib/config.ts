export const CONFIG = {
  video: {
    extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'],
    presets: [
      { value: '720p', label: '720p (HD)' },
      { value: '1080p', label: '1080p (Full HD)' },
      { value: '2k', label: '2K (Quad HD)' },
    ],
  },
  image: {
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'jfif'],
    formats: [
      { value: 'png', label: 'PNG' },
      { value: 'jpg', label: 'JPEG (JPG)' },
      { value: 'webp', label: 'WebP' },
      { value: 'bmp', label: 'BMP' },
    ],
  },
};
