import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
	video_extensions: string[];
	image_extensions: string[];
	video_presets: { value: string; label: string }[];
	image_formats: { value: string; label: string }[];
	crop_modes: { value: 'fixed' | 'ratio' | 'custom'; label: string }[];
	size_presets: { category: string; name: string; width: number; height: number }[];
	ratio_presets: { label: string; ratio: number }[];
}

// 默认配置（用于初始化，实际配置从后端获取）
export const DEFAULT_CONFIG: AppConfig = {
	video_extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'],
	image_extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'jfif'],
	video_presets: [
		{ value: '720p', label: '720p (HD)' },
		{ value: '1080p', label: '1080p (Full HD)' },
		{ value: '2k', label: '2K (Quad HD)' },
	],
	image_formats: [
		{ value: 'png', label: 'PNG' },
		{ value: 'jpg', label: 'JPEG (JPG)' },
		{ value: 'webp', label: 'WebP' },
		{ value: 'bmp', label: 'BMP' },
	],
	crop_modes: [
		{ value: 'fixed', label: '固定尺寸' },
		{ value: 'ratio', label: '按比例' },
		{ value: 'custom', label: '自定义' },
	],
	size_presets: [],
	ratio_presets: [],
};

// 全局配置对象
class ConfigManager {
	private config: AppConfig | null = null;
	private initPromise: Promise<AppConfig> | null = null;

	async getConfig(): Promise<AppConfig> {
		if (this.config) {
			return this.config;
		}

		if (!this.initPromise) {
			this.initPromise = this.fetchConfig();
		}

		return this.initPromise;
	}

	private async fetchConfig(): Promise<AppConfig> {
		try {
			const config = await invoke<AppConfig>('get_app_config');
			this.config = config;
			return config;
		} catch (error) {
			console.error('Failed to fetch config from backend, using defaults:', error);
			this.config = DEFAULT_CONFIG;
			return DEFAULT_CONFIG;
		}
	}

	// 同步获取（仅在已初始化后使用）
	getConfigSync(): AppConfig {
		if (!this.config) {
			throw new Error('Config not initialized. Use getConfig() instead.');
		}
		return this.config;
	}
}

export const configManager = new ConfigManager();
