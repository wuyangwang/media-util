export interface ErrorDiagnosis {
	category:
		| "input"
		| "permission"
		| "disk"
		| "codec"
		| "model"
		| "resource"
		| "unknown";
	reason: string;
	suggestion: string;
}

export function diagnoseTaskError(error: unknown): ErrorDiagnosis {
	const raw = String(error || "");
	const text = raw.toLowerCase();

	if (
		text.includes("not found") ||
		text.includes("no such file") ||
		text.includes("invalid data") ||
		text.includes("unsupported")
	) {
		return {
			category: "input",
			reason: "输入文件不存在、损坏或格式不受支持",
			suggestion: "请确认文件可播放/可打开，并使用受支持格式后重试",
		};
	}

	if (
		text.includes("permission denied") ||
		text.includes("access is denied") ||
		text.includes("operation not permitted")
	) {
		return {
			category: "permission",
			reason: "没有足够的文件访问权限",
			suggestion: "请检查目录读写权限，或将输出目录改到可写位置",
		};
	}

	if (
		text.includes("no space left") ||
		text.includes("disk full") ||
		text.includes("quota exceeded")
	) {
		return {
			category: "disk",
			reason: "磁盘空间不足，无法写入输出文件",
			suggestion: "请清理磁盘空间后重试，或更换输出位置",
		};
	}

	if (
		text.includes("ffmpeg") ||
		text.includes("encoder") ||
		text.includes("decoder") ||
		text.includes("codec")
	) {
		return {
			category: "codec",
			reason: "编解码器或转码参数不兼容",
			suggestion: "请尝试更换预设/格式，或先转为常见格式（H264 + AAC）再处理",
		};
	}

	if (
		text.includes("whisper") ||
		text.includes("model") ||
		text.includes("yolo") ||
		text.includes("onnx")
	) {
		return {
			category: "model",
			reason: "AI 模型未就绪或加载失败",
			suggestion: "请在设置中检查模型是否已下载并可用，然后重试",
		};
	}

	if (
		text.includes("out of memory") ||
		text.includes("cuda") ||
		text.includes("cudnn") ||
		text.includes("resource busy")
	) {
		return {
			category: "resource",
			reason: "系统资源不足（内存/显存/设备占用）",
			suggestion: "请关闭其他高负载程序，降低并发后重试",
		};
	}

	return {
		category: "unknown",
		reason: "无法自动判定具体原因",
		suggestion: "请查看错误日志，并优先检查输入文件、权限、磁盘空间与模型状态",
	};
}
