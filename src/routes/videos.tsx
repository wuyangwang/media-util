import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Plus,
	FolderPlus,
	Play,
	XCircle,
	Trash2,
	FileVideo,
	FolderOpen,
	Loader2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useTasks, TASK_STATUS_LABELS } from "@/hooks/useTasks";
import { DEFAULT_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { toast } from "sonner";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export const Route = createFileRoute("/videos")({
	component: Videos,
});

interface VideoTask {
	id: string;
	path: string;
	fileName: string;
	status: "pending" | "processing" | "converting" | "completed" | "failed";
	progress: number;
	outputPath?: string;
}

interface ProgressPayload {
	id: string;
	progress: number;
	status: string;
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

	useGSAP(
		() => {
			gsap.from(".header-animate > *", {
				y: -20,
				opacity: 0,
				stagger: 0.1,
				duration: 0.5,
				ease: "power2.out",
			});
		},
		{ scope: containerRef },
	);

	useGSAP(
		() => {
			if (tasks.length > 0) {
				gsap.from(".task-item-animate:last-child", {
					x: 20,
					opacity: 0,
					duration: 0.4,
					ease: "power2.out",
				});
			}
		},
		{ dependencies: [tasks.length], scope: containerRef },
	);

	const handlePickFiles = useCallback(async () => {
		if (checkProcessing()) return;
		const files = await open({
			multiple: true,
			filters: [{ name: "视频", extensions: DEFAULT_CONFIG.video_extensions }],
		});
		if (files) {
			await handleAddPaths(Array.isArray(files) ? files : [files]);
		}
	}, [handleAddPaths, checkProcessing]);

	const handlePickDir = useCallback(async () => {
		if (checkProcessing()) return;
		const dir = await open({ directory: true });
		if (dir) {
			await handleAddPaths([dir as string]);
		}
	}, [handleAddPaths, checkProcessing]);

	const startBatch = useCallback(async () => {
		if (checkProcessing()) return;
		if (tasks.length === 0) {
			toast.info("请先添加视频文件");
			return;
		}
		const pendingTasks = tasks.filter((t) => t.status !== "completed");
		if (pendingTasks.length === 0) {
			toast.info("所有任务已完成");
			return;
		}

		setProcessing(true);
		toast.info(`开始批量处理 ${pendingTasks.length} 个任务`);

		for (const task of tasks) {
			if (task.status === "completed") continue;

			try {
				const outputPath = await invoke<string>("get_formatted_output_path", {
					inputPath: task.path,
					operation: "converted",
					extension: "mp4",
				});

				setTasks(
					(prev) =>
						prev.map((t) =>
							t.id === task.id ? { ...t, outputPath } : t,
						) as VideoTask[],
				);

				await invoke("convert_video", {
					id: task.id,
					inputPath: task.path,
					outputPath,
					preset,
				});
			} catch (err) {
				toast.error(`任务 ${task.fileName} 失败: ${err}`);
			}
		}
		setProcessing(false);
	}, [tasks, setTasks, setProcessing, preset, checkProcessing]);

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
			setTasks(
				(prev) =>
					prev.map((t) => {
						if (t.id === event.payload.id) {
							let status: VideoTask["status"] = "converting";
							if (event.payload.status === "Completed") status = "completed";
							if (event.payload.status === "Failed") status = "failed";
							return {
								...t,
								progress: event.payload.progress,
								status: status,
							};
						}
						return t;
					}) as VideoTask[],
			);
		});

		const unlistenDrop = getCurrentWebview().onDragDropEvent(async (event) => {
			if (event.payload.type === "drop") {
				const paths = event.payload.paths;
				await handleAddPaths(paths);
			}
		});

		return () => {
			unlisten.then((fn) => fn());
			unlistenDrop.then((fn) => fn());
		};
	}, [handleAddPaths, setTasks]);

	return (
		<div ref={containerRef} className="flex flex-col h-full bg-background">
			<header className="p-6 border-b flex justify-between items-center header-animate">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">批量视频转换</h2>
					<p className="text-muted-foreground text-sm">
						{isScanning
							? "正在扫描目录，请稍候..."
							: "拖拽文件夹或多个视频文件到此处开始。"}
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						onClick={handlePickFiles}
						variant="outline"
						size="sm"
						title="添加文件"
					>
						{isScanning ? (
							<Loader2 className="size-4 mr-1 animate-spin" />
						) : (
							<Plus data-icon="inline-start" />
						)}
						添加文件
					</Button>
					<Button
						onClick={handlePickDir}
						variant="outline"
						size="sm"
						title="添加文件夹"
					>
						{isScanning ? (
							<Loader2 className="size-4 mr-1 animate-spin" />
						) : (
							<FolderPlus data-icon="inline-start" />
						)}
						添加文件夹
					</Button>
					<Button
						onClick={startBatch}
						size="sm"
						title={
							isAnyProcessing
								? "正在处理中..."
								: tasks.length === 0
									? "请先添加文件"
									: "开始处理"
						}
					>
						{processing ? (
							<Loader2 className="size-4 mr-1 animate-spin" />
						) : (
							<Play data-icon="inline-start" />
						)}
						全部开始
					</Button>
					<Button
						onClick={handleClearTasks}
						variant="ghost"
						size="sm"
						className="text-destructive"
						title={isAnyProcessing ? "正在处理中，无法清空" : "清空任务列表"}
					>
						<XCircle data-icon="inline-start" /> 清空
					</Button>
				</div>
			</header>

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
						<div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl bg-muted/10 animate-in fade-in duration-500">
							<FileVideo className="size-16 mb-4 opacity-10" />
							<p className="text-lg font-medium opacity-50">暂无任务</p>
							<p className="text-sm opacity-40">点击上方按钮或拖拽文件夹开始</p>
						</div>
					) : (
						tasks.map((task) => (
							<div
								key={task.id}
								className={cn(
									"task-item-animate p-4 border rounded-lg space-y-3 transition-all",
									task.status === "processing" || task.status === "converting"
										? "bg-primary/5 border-primary/20 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.1)]"
										: "bg-muted/30 border-border",
								)}
							>
								<div className="flex justify-between items-start">
									<div className="flex-1 min-w-0">
										<h3 className="text-sm font-semibold truncate flex items-center gap-2">
											{task.fileName}
											{task.status === "completed" && (
												<span className="inline-block size-2 rounded-full bg-green-500" />
											)}
										</h3>
										<p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
											{task.path}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<span
											className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${task.status === "completed" ? "bg-green-100 text-green-700" : task.status === "failed" ? "bg-red-100 text-red-700" : task.status === "pending" ? "bg-blue-100 text-blue-700" : "bg-primary/10 text-primary animate-pulse"}`}
										>
											{TASK_STATUS_LABELS[task.status]}
										</span>
										{task.status === "completed" && (
											<Button
												variant="ghost"
												size="icon-sm"
												className="text-primary hover:bg-primary/10"
												onClick={() => handleOpenFolder(task.outputPath)}
												title="打开所在文件夹"
											>
												<FolderOpen />
											</Button>
										)}
										<Button
											variant="ghost"
											size="icon-sm"
											className="text-muted-foreground hover:text-destructive transition-colors"
											onClick={() => handleRemoveTask(task.id)}
											title={
												isAnyProcessing &&
												(task.status === "processing" ||
													task.status === "converting")
													? "正在转换中，无法删除"
													: "删除任务"
											}
										>
											<Trash2 />
										</Button>
									</div>
								</div>
								{(task.progress! > 0 || task.status !== "pending") && (
									<div className="space-y-1.5">
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
