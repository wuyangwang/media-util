import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, FileAudio, FileVideo, FolderOpen } from "lucide-react";

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

interface TranscriptionProgressPayload {
	id: string;
	progress: number;
	status: TranscribeTaskStatus;
	output_path?: string;
	log?: string;
}

function TranscribePage() {
	const navigate = useNavigate();
	const [tasks, setTasks] = useState<TranscribeTask[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [models, setModels] = useState<ModelStatus[]>([]);
	const [translateToEnglish, setTranslateToEnglish] = useState(false);
	const [transcriptOutputDir, setTranscriptOutputDir] = useState<string>();
	const containerRef = useRef<HTMLDivElement>(null);
	const { modelId } = useTranscriptionSettings();

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
		tasks.some((task) =>
			["preparing", "normalizing_audio", "transcribing"].includes(task.status),
		);

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
			let added = 0;
			const nextTasks: TranscribeTask[] = [];

			try {
				for (const path of paths) {
					const files = await invoke<string[]>("scan_directory", {
						path,
						mode: "transcribe",
					});

					for (const file of files) {
						if (tasks.some((t) => t.path === file)) continue;
						nextTasks.push({
							id: Math.random().toString(36).slice(2),
							path: file,
							fileName: file.split(/[\\/]/).pop() || file,
							status: "pending",
							progress: 0,
						});
						added += 1;
					}
				}

				if (nextTasks.length > 0) {
					setTasks((prev) => [...prev, ...nextTasks]);
					toast.success(`已添加 ${added} 个待转写文件`);
				} else {
					toast.info("未发现新的可转写文件");
				}
			} catch (error) {
				toast.error(`添加文件失败: ${error}`);
			} finally {
				setIsScanning(false);
			}
		},
		[isAnyProcessing, tasks],
	);

	const { isDragActive } = useDragDropPaths(handleAddPaths);
	const { handlePickFiles, handlePickDir } = usePickMediaInputs({
		modeLabel: "媒体",
		extensions,
		checkProcessing: () => isAnyProcessing,
		handleAddPaths,
	});

	const handleStartBatch = useCallback(async () => {
		if (isAnyProcessing) {
			toast.error("已有任务在执行中");
			return;
		}
		if (tasks.length === 0) {
			toast.info("请先添加文件");
			return;
		}

		if (!selectedModelStatus?.downloaded) {
			toast.error("当前启用模型未下载，请先到设置页下载模型");
			navigate({ to: "/settings" });
			return;
		}

		setIsProcessing(true);
		for (const task of tasks) {
			if (task.status === "completed") continue;

			const outputPath = await invoke<string>("get_transcription_output_path");

			setTasks((prev) =>
				prev.map((t) =>
					t.id === task.id
						? {
								...t,
								status: "preparing",
								progress: 1,
								outputPath,
							}
						: t,
				),
			);

			try {
				await invoke("transcribe_media", {
					id: task.id,
					inputPath: task.path,
					outputPath,
					modelId,
					language: null,
					translateToEnglish:
						modelId.startsWith("whisper") && translateToEnglish,
				});
			} catch (error) {
				setTasks((prev) =>
					prev.map((t) =>
						t.id === task.id
							? {
									...t,
									status: "failed",
									progress: 0,
									log: String(error),
								}
							: t,
					),
				);
			}
		}
		setIsProcessing(false);
	}, [
		isAnyProcessing,
		modelId,
		selectedModelStatus,
		tasks,
		navigate,
		translateToEnglish,
	]);

	const handleOpenOutput = useCallback(async (path?: string) => {
		if (!path) return;
		try {
			await revealItemInDir(path);
		} catch (error) {
			toast.error(`打开目录失败: ${error}`);
		}
	}, []);

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
			await openPath(transcriptOutputDir);
		} catch (error) {
			toast.error(`打开目录失败: ${error}`);
		}
	}, [transcriptOutputDir]);

	const clearTasks = useCallback(() => {
		if (isAnyProcessing) {
			toast.error("任务处理中，无法清空");
			return;
		}
		setTasks([]);
	}, [isAnyProcessing]);

	useEffect(() => {
		refreshModels();
	}, [refreshModels]);

	useEffect(() => {
		void invoke<string>("get_transcription_output_dir")
			.then((dir) => setTranscriptOutputDir(dir))
			.catch((error) => toast.error(`读取输出目录失败: ${error}`));
	}, []);

	useEffect(() => {
		let mounted = true;
		const unlistenFns: Array<() => void> = [];
		listen<TranscriptionProgressPayload>("transcription-progress", (event) => {
			if (!mounted) return;
			const payload = event.payload;
			setTasks((prev) =>
				prev.map((task) =>
					task.id === payload.id
						? {
								...task,
								status: payload.status,
								progress: payload.progress,
								outputPath: payload.output_path || task.outputPath,
								log: payload.log,
							}
						: task,
				),
			);
		}).then((fn) => unlistenFns.push(fn));

		return () => {
			mounted = false;
			for (const fn of unlistenFns) fn();
		};
	}, []);

	useTaskPageAnimations(containerRef, tasks.length);

	return (
		<div
			ref={containerRef}
			className="relative flex h-full flex-col bg-background"
		>
			<DragDropOverlay
				active={isDragActive}
				title="松开鼠标导入音频/视频"
				description="支持文件或文件夹递归扫描"
			/>

			<TaskPageToolbar
				title="视频/音频转文字"
				descriptionIdle="模型与下载在设置页管理。视频会先提取音频后转写。"
				descriptionScanning="正在扫描媒体文件，请稍候..."
				pickFilesLabel="添加媒体"
				pickDirLabel="添加文件夹"
				isScanning={isScanning}
				isProcessing={isProcessing}
				isAnyProcessing={isAnyProcessing}
				hasTasks={tasks.length > 0}
				onPickFiles={handlePickFiles}
				onPickDir={handlePickDir}
				onStartBatch={handleStartBatch}
				onClearTasks={clearTasks}
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
								{selectedModelStatus?.downloaded ? "可用" : "未下载"}
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
					{tasks.length === 0 ? (
						<TaskEmptyState
							icon={FileAudio}
							title="暂无转写任务"
							description="点击上方按钮或拖拽媒体文件开始"
						/>
					) : (
						tasks.map((task) => {
							const isVideo = DEFAULT_CONFIG.video_extensions.includes(
								task.path.split(".").pop()?.toLowerCase() || "",
							);
							return (
								<div
									key={task.id}
									className="task-item-animate rounded-lg border bg-muted/30 p-4"
								>
									<div className="flex items-center justify-between gap-4">
										<div className="min-w-0 flex-1">
											<div className="mb-1 flex items-center gap-2">
												{isVideo ? (
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
										</div>
										<div className="shrink-0 space-y-2">
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleOpenOutput(task.outputPath)}
												disabled={!task.outputPath}
											>
												<FolderOpen className="mr-1 size-4" />
												打开输出
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleCopyOutputText(task.outputPath)}
												disabled={
													task.status !== "completed" || !task.outputPath
												}
											>
												<Copy className="mr-1 size-4" />
												复制文本
											</Button>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</main>
		</div>
	);
}
