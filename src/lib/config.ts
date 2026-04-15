import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
	video_extensions: string[];
	image_extensions: string[];
	video_presets: { value: string; label: string }[];
	image_formats: { value: string; label: string }[];
	crop_modes: { value: string; label: string }[];
	size_presets: { category: string; name: string; width: number; height: number }[];
	ratio_presets: { label: string; ratio: number }[];
}

export let DEFAULT_CONFIG: AppConfig;

class ConfigManager {
	async init(): Promise<void> {
		DEFAULT_CONFIG = await invoke<AppConfig>('get_app_config');
	}
}

export const configManager = new ConfigManager();
