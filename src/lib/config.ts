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
    cropModes: [
      { value: 'fixed', label: '固定尺寸' },
      { value: 'ratio', label: '按比例' },
      { value: 'custom', label: '自定义' },
    ],
    sizePresets: [
      // 证件照
      { category: '证件照', name: '一寸', width: 295, height: 413 },
      { category: '证件照', name: '二寸', width: 413, height: 579 },
      { category: '证件照', name: '小二寸', width: 413, height: 531 },
      { category: '证件照', name: '小一寸', width: 260, height: 378 },
      // 社交媒体
      { category: '社交媒体', name: '微信公众号封面', width: 900, height: 383 },
      { category: '社交媒体', name: '微信公众号次图', width: 500, height: 500 },
      { category: '社交媒体', name: '小红书', width: 3000, height: 4000 },
      { category: '社交媒体', name: '朋友圈', width: 1080, height: 1080 },
      { category: '社交媒体', name: '抖音', width: 1080, height: 1920 },
      { category: '社交媒体', name: '微博', width: 1080, height: 1080 },
      // 通用尺寸
      { category: '通用', name: '头像', width: 400, height: 400 },
      { category: '通用', name: '缩略图', width: 256, height: 256 },
      { category: '通用', name: '博客封面', width: 1200, height: 630 },
      { category: '通用', name: '电商主图', width: 800, height: 800 },
    ],
    ratioPresets: [
      { label: '1:1 (正方形)', ratio: 1.0 },
      { label: '16:9 (宽屏)', ratio: 16 / 9 },
      { label: '9:16 (竖屏)', ratio: 9 / 16 },
      { label: '4:3 (标准)', ratio: 4 / 3 },
      { label: '3:4 (竖版)', ratio: 3 / 4 },
      { label: '3:2 (照片)', ratio: 3 / 2 },
      { label: '2:3 (竖版照片)', ratio: 2 / 3 },
    ],
  },
};
