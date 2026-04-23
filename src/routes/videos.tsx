import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileVideo, FileText } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useTasks, VideoTask, TASK_STATUS_LABELS } from "@/hooks/useTasks";
import { DEFAULT_CONFIG } from "@/lib/config";
import { cn, formatBytes, formatDuration, formatBitrate } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DragDropOverlay } from "@/components/drag-drop-overlay";
import { useDragDropPaths } from "@/hooks/useDragDropPaths";
import { usePickMediaInputs } from "@/hooks/usePickMediaInputs";
import { useTaskPageAnimations } from "@/hooks/useTaskPageAnimations";
import { TaskPageToolbar } from "@/components/task-page-toolbar";
import { TaskEmptyState } from "@/components/task-empty-state";
import { TaskStatusBadge } from "@/components/task-status-badge";
import { TaskItemActions } from "@/components/task-item-actions";
import { TaskStartButton } from "@/components/task-start-button";

export const Route = createFileRoute("/videos")({
	component: Videos,
});

interface ProgressPayload {
	id: string;
	progress: number;
	status: string;
	log?: string;
}

function Videos() {
	const {
		tasks,
		setTasks,
		processing,
		isAnyProcessing,
		setProcessing,
		isScanning,
		handleAddPaths,
		removeTask,
		clearTasks,
		checkProcessing,
	} = useTasks<VideoTask>("video");
	const [preset, setPreset] = useState<string>(
		DEFAULT_CONFIG.video_presets[0].value,
	);

	const containerRef = useRef<HTMLDivElement>(null);
	const { isDragActive } = useDragDropPaths(handleAddPaths);
	const { handlePickFiles, handlePickDir } = usePickMediaInputs({
		modeLabel: "视频",
		extensions: DEFAULT_CONFIG.video_extensions,
		checkProcessing,
		handleAddPaths,
	});

	useTaskPageAnimations(containerRef, tasks.length);

	const handleStartTask = useCallback(
		async (task: VideoTask) => {
			try {
				let operation = "converted";
				let extension = "mp4";
				let presetParam: any = preset;

				if (preset === "extract_audio_mp3") {
					operation = "audio";
					extension = "mp3";
					presetParam = { extract_audio: { format: "mp3" } };
				} else if (preset === "extract_audio_wav") {
					operation = "audio";
					extension = "wav";
					presetParam = { extract_audio: { format: "wav" } };
				} else if (preset === "compress") {
					operation = "compressed";
					extension = "mp4";
					presetParam = "compress";
				}

				const outputPath = await invoke<string>("get_formatted_output_path", {
					inputPath: task.path,
					operation,
					extension,
				});

				setTasks(
					(prev) =>
						prev.map((t) =>
							t.id === task.id ? { ...t, outputPath, status: "pending" } : t,
						) as VideoTask[],
				);

				await invoke("convert_video_queued", {
					id: task.id,
					inputPath: task.path,
					outputPath,
					preset: presetParam,
				});
			} catch (err) {
				console.error(`Task ${task.id} failed to start:`, err);
				setTasks(
					(prev) =>
						prev.map((t) =>
							t.id === task.id
								? { ...t, status: "failed", log: String(err) }
								: t,
						) as VideoTask[],
				);
				throw err;
			}
		},
		[preset, setTasks],
	);

	const startBatch = useCallback(async () => {
		if (checkProcessing()) return;
		if (tasks.length === 0) {
			toast.info("请先添加视频文件");
			return;
		}

		setProcessing(true);
		toast.info(`已将 ${tasks.length} 个任务加入队列`);

		// 触发所有任务，允许用户更改预设后重新处理
		const promises = tasks.map((task) => handleStartTask(task));

		// 等待所有请求发送完毕，具体的转换完成由事件通知
		await Promise.allSettled(promises);
	}, [tasks, handleStartTask, setProcessing, checkProcessing]);

	const handleClearTasks = useCallback(() => {
		if (checkProcessing()) return;
		clearTasks();
	}, [clearTasks, checkProcessing]);

	const handleRemoveTask = useCallback(
		(id: string) => {
			if (checkProcessing()) return;
			removeTask(id);
		},
		[removeTask, checkProcessing],
	);

	const handleOpenFolder = useCallback(async (path?: string) => {
		if (path) {
			try {
				await revealItemInDir(path);
			} catch (err) {
				toast.error(`打开文件夹失败: ${err}`);
			}
		}
	}, []);

	useEffect(() => {
		const unlisten = listen<ProgressPayload>("conversion-progress", (event) => {
			setTasks((prev) => {
				const newTasks = prev.map((t) => {
					if (t.id === event.payload.id) {
						let status: VideoTask["status"] = "converting";
						if (event.payload.status === "Completed") status = "completed";
						if (event.payload.status === "Failed") status = "failed";
						return {
							...t,
							progress: event.payload.progress,
							status: status,
							log: event.payload.log || t.log,
						};
					}
					return t;
				}) as VideoTask[];

				// 如果没有正在进行的任务，重置处理状态
				const hasActive = newTasks.some(
					(t) => t.status === "converting" || t.status === "processing",
				);
				if (!hasActive) {
					setProcessing(false);
				}

				return newTasks;
			});
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [setProcessing, setTasks]);

	return (
		<div
			ref={containerRef}
			className="relative flex h-full flex-col bg-background"
		>
			<DragDropOverlay
				active={isDragActive}
				title="松开鼠标导入视频"
				description="支持拖拽视频文件或文件夹"
			/>
			<TaskPageToolbar
				title="批量视频转换"
				descriptionIdle="拖拽文件夹或多个视频文件到此处开始。"
				descriptionScanning="正在扫描目录，请稍候..."
				pickFilesLabel="添加文件"
				pickDirLabel="添加文件夹"
				isScanning={isScanning}
				isProcessing={processing}
				isAnyProcessing={isAnyProcessing}
				hasTasks={tasks.length > 0}
				onPickFiles={handlePickFiles}
				onPickDir={handlePickDir}
				onStartBatch={startBatch}
				onClearTasks={handleClearTasks}
			/>

			<main className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
				<Card className="shrink-0 header-animate">
					<CardContent className="p-4 flex items-center justify-between">
						<div className="flex items-center gap-4">
							<span className="text-sm font-medium">转换预设:</span>
							<Select
								value={preset}
								onValueChange={setPreset}
								disabled={isAnyProcessing}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue placeholder="选择预设" />
								</SelectTrigger>
								<SelectContent>
									{DEFAULT_CONFIG.video_presets.map((p) => (
										<SelectItem key={p.value} value={p.value}>
											{p.label}
										</SelectItem>
									))}
									<div className="h-px bg-muted my-1" />
									<SelectItem value="compress">一键压缩 (保持清晰)</SelectItem>
									<SelectItem value="extract_audio_mp3">
										提取音频 (MP3)
									</SelectItem>
									<SelectItem value="extract_audio_wav">
										提取音频 (WAV)
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="text-sm text-muted-foreground font-medium">
							队列中: {tasks.length} 个任务
						</div>
					</CardContent>
				</Card>

				<div className="flex-1 overflow-y-auto space-y-3 pr-2">
					{tasks.length === 0 ? (
						<TaskEmptyState
							icon={FileVideo}
							title="暂无任务"
							description="点击上方按钮或拖拽文件夹开始"
						/>
					) : (
						tasks.map((task) => (
							<div
								key={task.id}
								className={cn(
									"task-item-animate p-4 border rounded-lg transition-all",
									task.status === "processing" || task.status === "converting"
										? "bg-primary/5 border-primary/20 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.1)]"
										: "bg-muted/30 border-border",
								)}
							>
								<div className="flex gap-4">
									{/* Thumbnail */}
									<div className="size-20 bg-muted rounded flex items-center justify-center overflow-hidden shrink-0 border shadow-sm">
										{task.thumbnail ? (
											<img
												src={task.thumbnail}
												alt="预览"
												className="w-full h-full object-cover"
											/>
										) : (
											<FileVideo className="size-8 text-muted-foreground/20" />
										)}
									</div>

									<div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
										<div className="flex justify-between items-start">
											<div className="flex-1 min-w-0">
												<h3 className="text-sm font-semibold truncate flex items-center gap-2">
													{task.fileName}
													{task.status === "completed" && (
														<span className="inline-block size-2 rounded-full bg-green-500" />
													)}
												</h3>
												<div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
													{task.info ? (
														task.info.format !== "unknown" ? (
															<>
																<Badge
																	variant="secondary"
																	className="text-[10px] h-4 px-1"
																	title="格式"
																>
																	{task.info.format.toUpperCase()}
																</Badge>
																{task.info.video && (
																	<>
																		<span
																			className="text-[11px] text-muted-foreground"
																			title="分辨率"
																		>
																			{task.info.video.width} x{" "}
																			{task.info.video.height}
																		</span>
																		<span className="text-[11px] text-muted-foreground/60">
																			•
																		</span>
																		{task.info.duration > 0 && (
																			<>
																				<span
																					className="text-[11px] text-muted-foreground"
																					title="时长"
																				>
																					{formatDuration(task.info.duration)}
																				</span>
																				<span className="text-[11px] text-muted-foreground/60">
																					•
																				</span>
																			</>
																		)}
																		<span
																			className="text-[11px] text-muted-foreground"
																			title="帧率"
																		>
																			{parseFloat(task.info.video.fps).toFixed(
																				0,
																			)}{" "}
																			fps
																		</span>
																		<span className="text-[11px] text-muted-foreground/60">
																			•
																		</span>
																		<span
																			className="text-[11px] text-muted-foreground"
																			title="码率"
																		>
																			{formatBitrate(task.info.video.bitrate)}
																		</span>
																		<span className="text-[11px] text-muted-foreground/60">
																			•
																		</span>
																	</>
																)}
																<span
																	className="text-[11px] text-muted-foreground"
																	title="文件大小"
																>
																	{formatBytes(task.info.size)}
																</span>
															</>
														) : (
															<span className="text-[11px] text-muted-foreground">
																未知媒体信息
															</span>
														)
													) : (
														<span className="text-[11px] text-muted-foreground animate-pulse">
															正在读取信息...
														</span>
													)}
												</div>
												<p className="text-[10px] text-muted-foreground/50 truncate font-mono mt-1">
													{task.path}
												</p>
											</div>
											<TaskItemActions
												statusBadge={
													<TaskStatusBadge
														status={task.status}
														label={TASK_STATUS_LABELS[task.status]}
													/>
												}
												startAction={
													<TaskStartButton
														status={task.status}
														onStart={() => handleStartTask(task)}
													/>
												}
												extraActions={
													task.log ? (
														<Dialog>
															<DialogTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon-sm"
																	className="h-8 w-8 text-red-500 hover:bg-red-50"
																	title="查看错误日志"
																>
																	<FileText className="size-4" />
																</Button>
															</DialogTrigger>
															<DialogContent className="max-h-[80vh] max-w-2xl flex flex-col">
																<DialogHeader>
																	<DialogTitle>
																		错误日志: {task.fileName}
																	</DialogTitle>
																</DialogHeader>
																<div className="mt-4 flex-1 overflow-y-auto rounded-md bg-muted p-4">
																	<pre className="whitespace-pre-wrap break-all text-xs leading-relaxed text-muted-foreground">
																		{task.log}
																	</pre>
																</div>
															</DialogContent>
														</Dialog>
													) : undefined
												}
												showOpenFolder={task.status === "completed"}
												onOpenFolder={() => handleOpenFolder(task.outputPath)}
												onRemove={() => handleRemoveTask(task.id)}
												removeTitle={
													isAnyProcessing &&
													(task.status === "processing" ||
														task.status === "converting")
														? "正在转换中，无法删除"
														: "删除任务"
												}
												containerClassName="flex items-center gap-1.5"
											/>
										</div>
										{(task.progress! > 0 || task.status !== "pending") && (
											<div className="space-y-1 mt-2">
												<div className="flex justify-between text-[10px] font-bold text-muted-foreground">
													<span>进度</span>
													<span>{task.progress!.toFixed(1)}%</span>
												</div>
												<Progress
													value={task.progress}
													className="h-1.5 shadow-sm"
												/>
											</div>
										)}
									</div>
								</div>
							</div>
						))
					)}
				</div>
			</main>
		</div>
	);
}

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
