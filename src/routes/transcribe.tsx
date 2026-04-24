import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, FileAudio, FileVideo, FolderOpen, Play } from "lucide-react";

import { TaskPageToolbar } from "@/components/task-page-toolbar";
import { TaskEmptyState } from "@/components/task-empty-state";
import { DragDropOverlay } from "@/components/drag-drop-overlay";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDragDropPaths } from "@/hooks/useDragDropPaths";
import { usePickMediaInputs } from "@/hooks/usePickMediaInputs";
import { useTaskPageAnimations } from "@/hooks/useTaskPageAnimations";
import { useTaskStore } from "@/hooks/useTaskStore";
import { DEFAULT_CONFIG } from "@/lib/config";
import { useTranscriptionSettings } from "@/lib/store";

export const Route = createFileRoute("/transcribe")({
	component: TranscribePage,
});

type TranscribeTaskStatus =
	| "pending"
	| "preparing"
	| "normalizing_audio"
	| "transcribing"
	| "completed"
	| "failed";

interface TranscribeTask {
	id: string;
	path: string;
	fileName: string;
	status: TranscribeTaskStatus;
	progress: number;
	outputPath?: string;
	log?: string;
}

interface ModelStatus {
	id: string;
	label: string;
	downloaded: boolean;
	status: string;
	path?: string;
}

const MODEL_DESCRIPTIONS: Record<string, string> = {
	"whisper-medium": "平衡速度与准确度，适合大多数日常转写任务。",
	"whisper-large": "准确率更高，适合复杂语音或高质量识别场景。",
	"sense-voice": "轻量高效，适合快速转写与资源受限设备。",
};

function TranscribePage() {
	const navigate = useNavigate();
	const [isScanning, setIsScanning] = useState(false);
	const [models, setModels] = useState<ModelStatus[]>([]);
	const [translateToEnglish, setTranslateToEnglish] = useState(false);
	const [transcriptOutputDir, setTranscriptOutputDir] = useState<string>();
	const containerRef = useRef<HTMLDivElement>(null);
	const { modelId } = useTranscriptionSettings();
	const task = useTaskStore(
		(state) => state.transcribeTask,
	) as TranscribeTask | null;
	const isProcessing = useTaskStore((state) => state.transcribeProcessing);
	const setTask = useTaskStore((state) => state.setTranscribeTask);
	const setProcessing = useTaskStore((state) => state.setTranscribeProcessing);

	const extensions = useMemo(
		() => [
			...DEFAULT_CONFIG.video_extensions,
			...DEFAULT_CONFIG.audio_extensions,
		],
		[],
	);

	const isAnyProcessing =
		isScanning ||
		isProcessing ||
		(task
			? ["preparing", "normalizing_audio", "transcribing"].includes(task.status)
			: false);

	const selectedModelStatus = useMemo(
		() => models.find((model) => model.id === modelId),
		[modelId, models],
	);

	const refreshModels = useCallback(async () => {
		try {
			const statuses = await invoke<ModelStatus[]>(
				"get_transcription_models_status",
			);
			setModels(statuses);
		} catch (error) {
			toast.error(`读取模型状态失败: ${error}`);
		}
	}, []);

	const handleAddPaths = useCallback(
		async (paths: string[]) => {
			if (isAnyProcessing) {
				toast.error("任务处理中，请稍后再试");
				return;
			}

			setIsScanning(true);
			try {
				let nextTask: TranscribeTask | null = null;

				for (const path of paths) {
					const files = await invoke<string[]>("scan_directory", {
						path,
						mode: "transcribe",
					});

					const candidate = files.find((file) => {
						if (!task) return true;
						return (
							task.path !== file ||
							task.status === "completed" ||
							task.status === "failed" ||
							task.status === "pending"
						);
					});

					if (candidate) {
						nextTask = {
							id: Math.random().toString(36).slice(2),
							path: candidate,
							fileName: candidate.split(/[\\/]/).pop() || candidate,
							status: "pending",
							progress: 0,
						};
						break;
					}
				}

				if (nextTask) {
					setTask(nextTask);
					toast.success("已添加 1 个待转写文件");
				} else {
					toast.info("未发现新的可转写文件");
				}
			} catch (error) {
				toast.error(`添加文件失败: ${error}`);
			} finally {
				setIsScanning(false);
			}
		},
		[isAnyProcessing, setTask, task],
	);

	const { isDragActive } = useDragDropPaths(handleAddPaths);
	const { handlePickFiles } = usePickMediaInputs({
		modeLabel: "媒体",
		extensions,
		checkProcessing: () => isAnyProcessing,
		handleAddPaths,
		multipleFiles: false,
	});

	const handleStartTask = useCallback(async () => {
		if (isAnyProcessing) {
			toast.error("已有任务在执行中");
			return;
		}

		if (!task) {
			toast.info("请先添加文件");
			return;
		}

		if (!selectedModelStatus?.downloaded) {
			toast.error("当前启用模型未下载，请先到设置页下载模型");
			navigate({ to: "/settings" });
			return;
		}

		setProcessing(true);
		try {
			const outputPath = await invoke<string>("get_transcription_output_path");
			setTask((prev) =>
				prev && prev.id === task.id
					? {
							...prev,
							status: "preparing",
							progress: 1,
							outputPath,
							log: undefined,
						}
					: prev,
			);

			await invoke("transcribe_media", {
				id: task.id,
				inputPath: task.path,
				outputPath,
				modelId,
				language: null,
				translateToEnglish: modelId.startsWith("whisper") && translateToEnglish,
			});
		} catch (error) {
			setTask((prev) =>
				prev && prev.id === task.id
					? {
							...prev,
							status: "failed",
							progress: 0,
							log: String(error),
						}
					: prev,
			);
			setProcessing(false);
		}
	}, [
		isAnyProcessing,
		modelId,
		navigate,
		selectedModelStatus,
		setProcessing,
		setTask,
		task,
		translateToEnglish,
	]);

	const handleCopyOutputText = useCallback(async (path?: string) => {
		if (!path) return;
		try {
			const text = await invoke<string>("read_text_file", { path });
			await navigator.clipboard.writeText(text);
			toast.success("转写文本已复制");
		} catch (error) {
			toast.error(`复制失败: ${error}`);
		}
	}, []);

	const handleOpenTranscriptDir = useCallback(async () => {
		if (!transcriptOutputDir) return;
		try {
			await revealItemInDir(transcriptOutputDir);
		} catch (error) {
			toast.error(`打开目录失败: ${error}`);
		}
	}, [transcriptOutputDir]);

	useEffect(() => {
		refreshModels();
	}, [refreshModels]);

	useEffect(() => {
		void invoke<string>("get_transcription_output_dir")
			.then((dir) => setTranscriptOutputDir(dir))
			.catch((error) => toast.error(`读取输出目录失败: ${error}`));
	}, []);

	useTaskPageAnimations(containerRef, task ? 1 : 0);

	return (
		<div
			ref={containerRef}
			className="relative flex h-full flex-col bg-background"
		>
			<DragDropOverlay
				active={isDragActive}
				title="松开鼠标导入音频/视频"
				description="支持单个文件拖拽导入"
			/>

			<TaskPageToolbar
				title="视频/音频转文字"
				descriptionIdle="模型与下载在设置页管理。视频会先提取音频后转写。"
				descriptionScanning="正在扫描媒体文件，请稍候..."
				pickFilesLabel="添加媒体"
				pickDirLabel="添加文件夹"
				showPickDirButton={false}
				showStartBatchButton={false}
				showClearButton={false}
				isScanning={isScanning}
				isProcessing={isProcessing}
				isAnyProcessing={isAnyProcessing}
				hasTasks={!!task}
				onPickFiles={handlePickFiles}
				onPickDir={() => undefined}
				onStartBatch={handleStartTask}
				onClearTasks={() => undefined}
			/>

			<main className="flex flex-1 flex-col gap-6 overflow-hidden p-6">
				<Card className="shrink-0 header-animate">
					<CardContent className="flex items-center justify-between gap-4 p-4">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium">当前模型:</span>
							<span className="text-sm text-muted-foreground">
								{selectedModelStatus?.label || modelId}
							</span>
							<span className="text-xs text-muted-foreground">
								{MODEL_DESCRIPTIONS[modelId] || "通用语音转写模型。"}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">
								Whisper 输出
							</span>
							<Select
								value={translateToEnglish ? "en" : "origin"}
								onValueChange={(value) => setTranslateToEnglish(value === "en")}
								disabled={!modelId.startsWith("whisper")}
							>
								<SelectTrigger className="w-[160px]">
									<SelectValue placeholder="选择输出" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="origin">保持原语言</SelectItem>
									<SelectItem value="en">翻译为英文</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="icon"
								title="打开转写输出目录"
								onClick={handleOpenTranscriptDir}
								disabled={!transcriptOutputDir}
							>
								<FolderOpen className="size-4" />
							</Button>
							<Button
								variant="outline"
								onClick={() => navigate({ to: "/settings" })}
							>
								前往设置
							</Button>
						</div>
					</CardContent>
				</Card>

				<div className="flex-1 space-y-3 overflow-y-auto pr-2">
					{!task ? (
						<TaskEmptyState
							icon={FileAudio}
							title="暂无转写任务"
							description="点击上方按钮或拖拽媒体文件开始"
						/>
					) : (
						<div className="task-item-animate rounded-lg border bg-muted/30 p-4">
							<div className="flex items-center justify-between gap-4">
								<div className="min-w-0 flex-1">
									<div className="mb-1 flex items-center gap-2">
										{DEFAULT_CONFIG.video_extensions.includes(
											task.path.split(".").pop()?.toLowerCase() || "",
										) ? (
											<FileVideo className="size-4 text-muted-foreground" />
										) : (
											<FileAudio className="size-4 text-muted-foreground" />
										)}
										<span className="truncate text-sm font-semibold">
											{task.fileName}
										</span>
									</div>
									<div className="text-xs text-muted-foreground">
										状态: {task.status}
									</div>
									<Progress value={task.progress} className="mt-2" />
									{task.log && (
										<div className="mt-2 text-xs text-destructive line-clamp-2">
											{task.log}
										</div>
									)}
									{task.status === "completed" && (
										<div className="mt-3 whitespace-pre-line text-xs leading-5 text-emerald-600">
											{"转写成功\n可点击下方按钮复制文本"}
										</div>
									)}
								</div>
								<div className="shrink-0 space-y-2">
									<Button
										variant="ghost"
										size="sm"
										onClick={handleStartTask}
										disabled={
											isAnyProcessing ||
											[
												"preparing",
												"normalizing_audio",
												"transcribing",
											].includes(task.status)
										}
									>
										<Play className="mr-1 size-4" />
										开始
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleCopyOutputText(task.outputPath)}
										disabled={task.status !== "completed" || !task.outputPath}
									>
										<Copy className="mr-1 size-4" />
										复制文本
									</Button>
								</div>
							</div>
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
