import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
	video_extensions: string[];
	audio_extensions: string[];
	image_extensions: string[];
	video_presets: { value: string; label: string }[];
	image_formats: { value: string; label: string }[];
	compression_presets: { value: number; label: string }[];
	crop_modes: { value: string; label: string }[];
	size_presets: {
		category: string;
		name: string;
		width: number;
		height: number;
	}[];
	ratio_presets: { label: string; ratio: number }[];
}

// 导出全局配置变量，初始化为空对象以防止解构报错
export const DEFAULT_CONFIG: AppConfig = {
	video_extensions: [],
	audio_extensions: [],
	image_extensions: [],
	video_presets: [],
	image_formats: [],
	compression_presets: [],
	crop_modes: [],
	size_presets: [],
	ratio_presets: [],
};

/**
 * 初始化配置，从后端获取数据并注入到全局变量中
 */
export async function initConfig() {
	try {
		const config = await invoke<AppConfig>("get_app_config");
		Object.assign(DEFAULT_CONFIG, config);
	} catch (err) {
		console.error("Failed to initialize config:", err);
	}
}
