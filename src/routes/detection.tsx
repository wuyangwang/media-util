import { createFileRoute } from "@tanstack/react-router";
import { useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
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
import { useDetectionStore, DetectionTask } from "@/hooks/useDetectionStore";
import { Progress } from "@/components/ui/progress";

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
	useTaskPageAnimations(containerRef, tasks.length);

	const handleAddPaths = useCallback(
		async (paths: string[]) => {
			for (const path of paths) {
				const fileName = path.split(/[\\/]/).pop() || "";
				const ext = fileName.split(".").pop()?.toLowerCase() || "";
				const is_video = DEFAULT_CONFIG.video_extensions.includes(ext);

				const newTask: DetectionTask = {
					id: Math.random().toString(36).substring(2, 9),
					path,
					fileName,
					is_video,
					status: "pending",
					progress: 0,
				};
				addTask(newTask);
			}
		},
		[addTask],
	);

	const { isDragActive } = useDragDropPaths(handleAddPaths);

	const checkProcessing = useCallback(() => {
		if (processing) {
			toast.error("正在处理中，请稍候");
			return true;
		}
		return false;
	}, [processing]);

	const { handlePickFiles, handlePickDir } = usePickMediaInputs({
		modeLabel: "媒体文件",
		extensions: [
			...DEFAULT_CONFIG.image_extensions,
			...DEFAULT_CONFIG.video_extensions,
		],
		checkProcessing,
		handleAddPaths,
	});

	const handleStartTask = useCallback(
		async (task: DetectionTask) => {
			updateTask(task.id, { status: "processing", progress: 0 });
			try {
				const result = await invoke<string>("detect_objects", {
					id: task.id,
					inputPath: task.path,
					isVideo: task.is_video,
				});

				if (!task.is_video) {
					updateTask(task.id, {
						status: "completed",
						progress: 100,
						resultPath: result,
					});
				}
			} catch (err) {
				updateTask(task.id, { status: "failed", log: String(err) });
				toast.error(`检测失败: ${err}`);
			}
		},
		[updateTask],
	);

	const startBatch = useCallback(async () => {
		const pendingTasks = tasks.filter((t) => t.status === "pending");
		if (pendingTasks.length === 0) {
			toast.info("没有待处理的任务");
			return;
		}
		setProcessing(true);
		for (const task of pendingTasks) {
			await handleStartTask(task);
		}
		setProcessing(false);
	}, [tasks, handleStartTask, setProcessing]);

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
				isScanning={false}
				isProcessing={processing}
				isAnyProcessing={processing}
				hasTasks={tasks.length > 0}
				onPickFiles={handlePickFiles}
				onPickDir={handlePickDir}
				onStartBatch={startBatch}
				onClearTasks={clearTasks}
			/>

			<main className="flex flex-1 flex-col gap-6 overflow-hidden p-6">
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
													handleOpenFolder(task.resultPath || task.path)
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
											<span>正在分析媒体内容...</span>
											<span>{Math.round(task.progress)}%</span>
										</div>
										<Progress value={task.progress} className="h-1" />
									</div>
								)}

								{task.status === "completed" && task.resultPath && (
									<div className="mt-3 flex items-center gap-2 text-[11px] text-primary">
										<FolderOpen className="size-3" />
										<span className="truncate">
											结果保存至: {task.resultPath}
										</span>
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
