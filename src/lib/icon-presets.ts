export type IconPlatformPreset = {
	platform: string;
	format: "png" | "ico" | "icns";
	sizes: number[];
	description: string;
};

export const APP_ICON_PRESETS: IconPlatformPreset[] = [
	{
		platform: "Windows",
		format: "ico",
		sizes: [16, 32, 48, 128, 256],
		description: "输出多尺寸 .ico 文件",
	},
	{
		platform: "macOS",
		format: "icns",
		sizes: [16, 32, 64, 128, 256, 512, 1024],
		description: "输出包含多尺寸的 .icns 文件",
	},
	{
		platform: "Android",
		format: "png",
		sizes: [48, 72, 96, 144, 192],
		description: "对应 mdpi ~ xxxhdpi",
	},
	{
		platform: "iOS",
		format: "png",
		sizes: [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024],
		description: "包含通知、设置、主屏与 App Store",
	},
];
