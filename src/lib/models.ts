export type TranscriptionModelId =
	| "funasr-nano-int8"
	| "whisper-medium"
	| "whisper-large"
	| "sense-voice-int8"
	| "sense-voice";

export const TRANSCRIPTION_MODEL_DESCRIPTIONS: Record<
	TranscriptionModelId,
	string
> = {
	"funasr-nano-int8":
		"阿里 FunAsr Nano 轻量版，专门针对中文语音优化，极速识别。",
	"whisper-medium": "平衡速度与准确度，适合大多数日常转写任务。",
	"whisper-large": "准确率更高，适合复杂语音或高质量识别场景。",
	"sense-voice-int8": "SenseVoice 轻量化版本，适合快速转写，资源占用低。",
	"sense-voice": "SenseVoice 全量版本，提供更高精度的转写效果。",
};
