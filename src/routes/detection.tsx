import { createFileRoute } from "@tanstack/react-router";
import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Scan, FolderOpen, Trash2, ImageIcon, PlayCircle } from "lucide-react";
import { DEFAULT_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";
import { DragDropOverlay } from "@/components/drag-drop-overlay";
import { useDragDropPaths } from "@/hooks/useDragDropPaths";
import { usePickMediaInputs } from "@/hooks/usePickMediaInputs";
import { useTaskPageAnimations } from "@/hooks/useTaskPageAnimations";
import { TaskPageToolbar } from "@/components/task-page-toolbar";
import { TaskEmptyState } from "@/components/task-empty-state";
import { TaskStatusBadge } from "@/components/task-status-badge";
import { TaskStartButton } from "@/components/task-start-button";
import { useDetectionStore, DetectionTask } from "@/hooks/useDetectionStore";
import { Progress } from "@/components/ui/progress";
import { diagnoseTaskError } from "@/lib/error-diagnosis";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/detection")({
	component: Detection,
});

function Detection() {
	const {
		tasks,
		addTask,
		removeTask,
		updateTask,
		clearTasks,
		processing,
		setProcessing,
	} = useDetectionStore();

	const containerRef = useRef<HTMLDivElement>(null);
	const [sampleEvery, setSampleEvery] = useState(5);
	const [scoreThreshold, setScoreThreshold] = useState(0.25);
	const [iouThreshold, setIouThreshold] = useState(0.45);
	useTaskPageAnimations(containerRef, tasks.length);

	const clampedSampleEvery = useMemo(
		() => Math.max(1, sampleEvery),
		[sampleEvery],
	);
	const clampedScoreThreshold = useMemo(
		() => Math.min(0.99, Math.max(0.01, scoreThreshold)),
		[scoreThreshold],
	);
	const clampedIouThreshold = useMemo(
		() => Math.min(0.99, Math.max(0.01, iouThreshold)),
		[iouThreshold],
	);

	const loadClassStats = useCallback(
		async (taskId: string, basePath?: string) => {
			if (!basePath) return;
			const dir = /\.[^\\/]+$/.test(basePath)
				? basePath.replace(/[\\/][^\\/]+$/, "")
				: basePath;
			const csvPath = `${dir}/detection_stats.csv`;
			try {
				const csv = await invoke<string>("read_text_file", { path: csvPath });
				const lines = csv.trim().split(/\r?\n/).slice(1);
				const classStats = lines
					.map((line) => line.split(","))
					.filter((cols) => cols.length >= 5)
					.map((cols) => ({
						classId: Number(cols[0]),
						className: cols[1],
						detections: Number(cols[2]),
						frameHits: Number(cols[3]),
						avgConfidence: Number(cols[4]),
					}))
					.filter((item) => Number.isFinite(item.classId));
				updateTask(taskId, { csvPath, classStats });
			} catch {
				// ignore stats loading failure, detection result itself is still valid
			}
		},
		[updateTask],
	);

	const checkProcessing = useCallback(() => {
		if (processing) {
			toast.error("正在处理中，请稍候");
			return true;
		}
		return false;
	}, [processing]);

	const handleStartTask = useCallback(
		async (task: DetectionTask) => {
			updateTask(task.id, { status: "processing", progress: 0 });
			try {
				const result = await invoke<string>("detect_objects", {
					id: task.id,
					inputPath: task.path,
					isVideo: task.is_video,
					sampleEvery: clampedSampleEvery,
					scoreThreshold: clampedScoreThreshold,
					iouThreshold: clampedIouThreshold,
				});

				updateTask(task.id, {
					outputPath: task.is_video ? result : undefined,
				});
				if (!task.is_video) {
					updateTask(task.id, {
						status: "completed",
						progress: 100,
						resultPath: result,
					});
					await loadClassStats(task.id, result);
				}
			} catch (err) {
				updateTask(task.id, { status: "failed", log: String(err) });
				const diagnosis = diagnoseTaskError(err);
				toast.error(
					`检测失败：${diagnosis.reason}。建议：${diagnosis.suggestion}`,
				);
			}
		},
		[
			clampedIouThreshold,
			clampedSampleEvery,
			clampedScoreThreshold,
			loadClassStats,
			updateTask,
		],
	);

	useEffect(() => {
		let mounted = true;
		let unlisten: (() => void) | undefined;
		const setup = async () => {
			unlisten = await listen<{
				id: string;
				progress: number;
				status: string;
				result_path?: string;
			}>("detection-progress", (event) => {
				if (!mounted) return;
				const payload = event.payload;
				if (payload.status === "Completed") {
					updateTask(payload.id, {
						status: "completed",
						progress: 100,
						resultPath: payload.result_path,
					});
					void loadClassStats(payload.id, payload.result_path);
					setProcessing(false);
					return;
				}
				if (payload.status.startsWith("Error:")) {
					updateTask(payload.id, {
						status: "failed",
						progress: 0,
						log: payload.status,
					});
					setProcessing(false);
					const diagnosis = diagnoseTaskError(payload.status);
					toast.error(
						`检测失败：${diagnosis.reason}。建议：${diagnosis.suggestion}`,
					);
					return;
				}
				updateTask(payload.id, {
					status: "processing",
					progress: payload.progress,
					resultPath: payload.result_path,
					log: payload.status,
				});
			});
		};
		setup();
		return () => {
			mounted = false;
			if (unlisten) unlisten();
		};
	}, [loadClassStats, setProcessing, updateTask]);

	const handleExportCsv = useCallback(async (task: DetectionTask) => {
		const csvPath = task.csvPath;
		if (!csvPath) {
			toast.error("当前任务暂无可导出的统计 CSV");
			return;
		}
		try {
			const csvContent = await invoke<string>("read_text_file", {
				path: csvPath,
			});
			const output = await save({
				filters: [{ name: "CSV", extensions: ["csv"] }],
				defaultPath: `${task.fileName.replace(/\.[^/.]+$/, "")}_detection_stats.csv`,
			});
			if (!output) return;
			await writeTextFile(output, csvContent);
			toast.success("CSV 导出成功");
		} catch (err) {
			toast.error(`CSV 导出失败: ${err}`);
		}
	}, []);

	const handleAddPaths = useCallback(
		async (paths: string[]) => {
			if (checkProcessing()) return;
			if (paths.length === 0) return;
			if (paths.length > 1) {
				toast.info("每次只能添加一个文件");
			}

			const path = paths[0];
			const fileName = path.split(/[\\/]/).pop() || "";
			const ext = fileName.split(".").pop()?.toLowerCase() || "";
			const isImage = DEFAULT_CONFIG.image_extensions.includes(ext);
			const isVideo = DEFAULT_CONFIG.video_extensions.includes(ext);
			if (!isImage && !isVideo) {
				toast.error("不支持文件夹或该文件类型，请选择单个图片或视频文件");
				return;
			}

			const newTask: DetectionTask = {
				id: Math.random().toString(36).substring(2, 9),
				path,
				fileName,
				is_video: isVideo,
				status: "pending",
				progress: 0,
			};
			addTask(newTask);
		},
		[addTask, checkProcessing],
	);

	const { isDragActive } = useDragDropPaths(handleAddPaths);

	const { handlePickFiles } = usePickMediaInputs({
		modeLabel: "媒体文件",
		extensions: [
			...DEFAULT_CONFIG.image_extensions,
			...DEFAULT_CONFIG.video_extensions,
		],
		checkProcessing,
		handleAddPaths,
		multipleFiles: false,
	});

	const handlePickDirDisabled = useCallback(async () => {
		toast.info("目标检测仅支持单个文件上传，不支持目录");
	}, []);

	const startBatch = useCallback(async () => {
		if (tasks.length > 0) {
			toast.info("顶部批量开始已关闭，请在任务行点击开始");
			return;
		}
	}, [tasks.length]);

	const handleRunTask = useCallback(
		async (task: DetectionTask) => {
			if (checkProcessing()) return;
			setProcessing(true);
			await handleStartTask(task);
			setProcessing(false);
		},
		[checkProcessing, handleStartTask, setProcessing],
	);

	const resolveRevealTarget = useCallback((task: DetectionTask) => {
		const path = task.resultPath || task.outputPath || task.path;
		if (path === task.path) {
			return task.path.replace(/[\\/][^\\/]+$/, "");
		}
		return path;
	}, []);

	const handleOpenFolder = useCallback(async (path?: string) => {
		if (path) {
			try {
				await revealItemInDir(path);
			} catch (err) {
				toast.error(`打开文件夹失败: ${err}`);
			}
		}
	}, []);

	return (
		<div
			ref={containerRef}
			className="relative flex h-full flex-col bg-background"
		>
			<DragDropOverlay
				active={isDragActive}
				title="松开鼠标开始检测"
				description="支持图片或视频文件"
			/>
			<TaskPageToolbar
				title="智能目标检测 (YOLOv11)"
				descriptionIdle="上传图片或视频，自动识别物体并保存结果。"
				descriptionScanning="正在扫描..."
				pickFilesLabel="添加媒体"
				pickDirLabel="添加目录"
				showPickDirButton={false}
				showStartBatchButton={false}
				isScanning={false}
				isProcessing={processing}
				isAnyProcessing={processing}
				hasTasks={tasks.length > 0}
				onPickFiles={handlePickFiles}
				onPickDir={handlePickDirDisabled}
				onStartBatch={startBatch}
				onClearTasks={clearTasks}
			/>

			<main className="flex flex-1 flex-col gap-6 overflow-hidden p-6">
				<Card className="window-surface shrink-0">
					<CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
						<label className="space-y-1">
							<div className="text-xs text-muted-foreground">
								视频采样间隔（每 N 帧）
							</div>
							<Input
								type="number"
								min={1}
								value={sampleEvery}
								onChange={(e) => setSampleEvery(Number(e.target.value) || 1)}
								disabled={processing}
							/>
						</label>
						<label className="space-y-1">
							<div className="text-xs text-muted-foreground">
								置信度阈值（0.01 - 0.99）
							</div>
							<Input
								type="number"
								min={0.01}
								max={0.99}
								step={0.01}
								value={scoreThreshold}
								onChange={(e) =>
									setScoreThreshold(Number(e.target.value) || 0.25)
								}
								disabled={processing}
							/>
						</label>
						<label className="space-y-1">
							<div className="text-xs text-muted-foreground">
								IoU 阈值（0.01 - 0.99）
							</div>
							<Input
								type="number"
								min={0.01}
								max={0.99}
								step={0.01}
								value={iouThreshold}
								onChange={(e) =>
									setIouThreshold(Number(e.target.value) || 0.45)
								}
								disabled={processing}
							/>
						</label>
					</CardContent>
				</Card>

				<div className="flex-1 space-y-3 overflow-y-auto pr-2">
					{tasks.length === 0 ? (
						<TaskEmptyState
							icon={Scan}
							title="准备就绪"
							description="添加文件后点击开始，系统将每5帧进行一次目标检测。"
						/>
					) : (
						tasks.map((task) => (
							<div
								key={task.id}
								className={cn(
									"task-item-animate flex flex-col rounded-lg border p-4 transition-all",
									task.status === "processing"
										? "border-primary/20 bg-primary/5"
										: "border-border bg-muted/30",
								)}
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-4 flex-1 min-w-0">
										<div className="size-12 bg-muted rounded flex items-center justify-center shrink-0 border">
											{task.is_video ? (
												<PlayCircle className="size-6 text-primary" />
											) : (
												<ImageIcon className="size-6 text-muted-foreground" />
											)}
										</div>
										<div className="min-w-0 flex-1">
											<h3 className="truncate text-sm font-semibold">
												{task.fileName}
											</h3>
											<p className="truncate font-mono text-[10px] text-muted-foreground/50">
												{task.path}
											</p>
										</div>
									</div>

									<div className="flex items-center gap-2">
										<TaskStatusBadge
											status={
												task.status === "processing"
													? "converting"
													: task.status
											}
											label={
												task.status === "processing"
													? "检测中"
													: task.status === "completed"
														? "已完成"
														: task.status === "failed"
															? "失败"
															: "待处理"
											}
										/>
										<TaskStartButton
											status={task.status}
											onStart={() => handleRunTask(task)}
										/>
										<Button
											size="icon"
											variant="ghost"
											className="size-8"
											onClick={() => removeTask(task.id)}
											disabled={task.status === "processing"}
										>
											<Trash2 className="size-4 text-destructive" />
										</Button>
										{task.status === "completed" && (
											<Button
												size="icon"
												variant="ghost"
												className="size-8"
												onClick={() =>
													handleOpenFolder(resolveRevealTarget(task))
												}
											>
												<FolderOpen className="size-4" />
											</Button>
										)}
									</div>
								</div>

								{task.status === "processing" && (
									<div className="mt-4 space-y-2">
										<div className="flex justify-between text-[10px] text-muted-foreground">
											<span>{task.log || "正在分析媒体内容..."}</span>
											<span>{Math.round(task.progress)}%</span>
										</div>
										<Progress value={task.progress} className="h-1" />
									</div>
								)}

								{task.status === "completed" &&
									(task.resultPath || task.outputPath) && (
										<div className="mt-3 flex items-center gap-2 text-[11px] text-primary">
											<FolderOpen className="size-3" />
											<span className="truncate">
												结果保存至: {task.resultPath || task.outputPath}
											</span>
										</div>
									)}
								{task.status === "completed" && (
									<div className="mt-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => handleExportCsv(task)}
											disabled={!task.csvPath}
										>
											导出统计 CSV
										</Button>
									</div>
								)}
								{task.classStats && task.classStats.length > 0 && (
									<div className="mt-3 rounded border bg-muted/20 p-2">
										<div className="mb-1 text-[11px] font-medium text-foreground">
											按类统计
										</div>
										<div className="space-y-1 text-[11px] text-muted-foreground">
											{task.classStats.map((s) => (
												<div
													key={`${task.id}-${s.classId}`}
													className="flex items-center justify-between gap-2"
												>
													<span className="truncate">{s.className}</span>
													<span className="shrink-0">
														检测 {s.detections} 次 / 命中 {s.frameHits} 帧 /
														置信度 {s.avgConfidence.toFixed(2)}
													</span>
												</div>
											))}
										</div>
									</div>
								)}
								{task.status === "failed" && task.log && (
									<div className="mt-3 rounded border border-destructive/25 bg-destructive/5 p-2 text-[11px]">
										<div className="text-destructive">
											失败原因：{diagnoseTaskError(task.log).reason}
										</div>
										<div className="mt-1 text-muted-foreground">
											建议：{diagnoseTaskError(task.log).suggestion}
										</div>
									</div>
								)}
							</div>
						))
					)}
				</div>
			</main>
		</div>
	);
}
