import { createFileRoute } from "@tanstack/react-router";
import { useRef, useCallback, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Image as ImageIcon, Minimize2 } from "lucide-react";
import { DEFAULT_CONFIG } from "@/lib/config";
import { useTasks, ImageTask, TASK_STATUS_LABELS } from "@/hooks/useTasks";
import { cn, formatBytes } from "@/lib/utils";
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
import { ImageIconTab } from "@/components/image-icon-tab";
import { APP_ICON_PRESETS } from "@/lib/icon-presets";
import { MediaPreviewDialog } from "@/components/media-preview-dialog";

export const Route = createFileRoute("/images")({
	component: Images,
});

type ImageFlowTab = "convert" | "compress" | "icons";
type PngCompressionMode = "lossless" | "lossy";

function Images() {
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
	} = useTasks<ImageTask>("image");
	const [activeTab, setActiveTab] = useState<ImageFlowTab>("convert");
	const [targetFormat, setTargetFormat] = useState("png");
	const [selectedPreset, setSelectedPreset] = useState<string>("0");
	const [selectedQuality, setSelectedQuality] = useState<string>(
		DEFAULT_CONFIG.compression_presets[0]?.value.toString() || "75",
	);
	const [pngCompressionMode, setPngCompressionMode] =
		useState<PngCompressionMode>("lossless");
	const [selectedIconPlatforms, setSelectedIconPlatforms] = useState<string[]>([
		APP_ICON_PRESETS[0]?.platform || "Windows",
	]);
	const customPreset = useMemo(
		() => DEFAULT_CONFIG.size_presets.find((p) => p.name === "自定义"),
		[],
	);
	const [customSize, setCustomSize] = useState({
		width: customPreset?.width || 800,
		height: customPreset?.height || 800,
	});
	const containerRef = useRef<HTMLDivElement>(null);
	const { isDragActive } = useDragDropPaths(handleAddPaths);
	const { handlePickFiles, handlePickDir } = usePickMediaInputs({
		modeLabel: "图片",
		extensions: DEFAULT_CONFIG.image_extensions,
		checkProcessing,
		handleAddPaths,
	});

	const isCustom = useMemo(() => {
		const preset = DEFAULT_CONFIG.size_presets[parseInt(selectedPreset)];
		return preset?.name === "自定义";
	}, [selectedPreset]);
	const isCompressTab = activeTab === "compress";
	const isIconTab = activeTab === "icons";

	useTaskPageAnimations(containerRef, tasks.length);

	const handleStartTask = useCallback(
		async (task: ImageTask) => {
			if (isIconTab && selectedIconPlatforms.length === 0) {
				toast.error("请至少选择一个目标平台");
				return;
			}

			const preset = DEFAULT_CONFIG.size_presets[parseInt(selectedPreset)];
			if (!preset && !isIconTab) {
				toast.error("尺寸预设无效");
				return;
			}

			setTasks((prev) =>
				prev.map((t) =>
					t.id === task.id ? { ...t, status: "processing" } : t,
				),
			);
			try {
				const operation = isIconTab
					? "app_icons"
					: isCompressTab
						? "compress"
						: isCustom
							? "custom"
							: preset?.name === "原图尺寸"
								? "convert"
								: "fixed";

				const outputPath = await invoke<string>("get_formatted_output_path", {
					inputPath: task.path,
					operation,
					extension: isIconTab
						? "zip"
						: targetFormat === "original"
							? null
							: targetFormat,
				});

				if (isIconTab) {
					await invoke("generate_app_icons", {
						inputPath: task.path,
						outputZipPath: outputPath,
						platforms: selectedIconPlatforms,
					});
				} else {
					await invoke("process_image_pipeline", {
						inputPath: task.path,
						outputPath,
						presetIndex: parseInt(selectedPreset),
						useCustomSize: isCustom,
						targetWidth: isCustom ? customSize.width : 0,
						targetHeight: isCustom ? customSize.height : 0,
						compressEnabled: isCompressTab,
						quality: isCompressTab ? parseInt(selectedQuality) : 100,
						pngLossy: isCompressTab && pngCompressionMode === "lossy",
					});
				}

				setTasks((prev) =>
					prev.map((t) =>
						t.id === task.id
							? { ...t, status: "completed", output: outputPath }
							: t,
					),
				);
			} catch (err) {
				setTasks((prev) =>
					prev.map((t) => (t.id === task.id ? { ...t, status: "failed" } : t)),
				);
				toast.error(`任务 ${task.fileName} 失败: ${err}`);
				throw err;
			}
		},
		[
			selectedPreset,
			isCustom,
			customSize,
			targetFormat,
			setTasks,
			isCompressTab,
			isIconTab,
			selectedIconPlatforms,
			selectedQuality,
			pngCompressionMode,
		],
	);

	const toggleIconPlatform = useCallback((platform: string) => {
		setSelectedIconPlatforms((prev) =>
			prev.includes(platform)
				? prev.filter((item) => item !== platform)
				: [...prev, platform],
		);
	}, []);

	const startBatch = useCallback(async () => {
		if (checkProcessing()) return;
		if (tasks.length === 0) {
			toast.info("请先添加图片文件");
			return;
		}
		setProcessing(true);

		const promises = tasks.map((task) => handleStartTask(task));
		await Promise.allSettled(promises);
		setProcessing(false);
	}, [checkProcessing, tasks, handleStartTask, setProcessing]);

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

	const handleBatchDownload = useCallback(async () => {
		if (checkProcessing()) return;
		const completedTasks = tasks.filter(
			(t) => t.status === "completed" && t.output,
		);
		if (completedTasks.length === 0) {
			toast.error("没有可下载的任务");
			return;
		}
		const filePath = await save({
			filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
			defaultPath: "images_batch.zip",
		});
		if (!filePath) return;
		try {
			await invoke("batch_to_zip", {
				filePaths: completedTasks.map((t) => t.output!),
				outputZipPath: filePath,
			});
			toast.success(`文件已保存到: ${filePath}`);
		} catch (err) {
			toast.error(`打包失败: ${err}`);
		}
	}, [tasks, checkProcessing]);

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
				title="松开鼠标导入图片"
				description="支持拖拽图片文件或文件夹"
			/>
			<TaskPageToolbar
				title="批量图片处理"
				descriptionIdle="拖拽图片文件或文件夹开始。"
				descriptionScanning="正在扫描目录..."
				pickFilesLabel="添加图片"
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

			<main className="flex flex-1 flex-col gap-6 overflow-hidden p-6">
				<Card className="header-animate shrink-0">
					<CardContent className="p-4">
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div className="flex flex-1 flex-col gap-4">
								<div className="inline-flex rounded-lg border bg-muted/30 p-1">
									<Button
										size="sm"
										variant={activeTab === "convert" ? "default" : "ghost"}
										onClick={() => setActiveTab("convert")}
										disabled={isAnyProcessing}
									>
										<ImageIcon data-icon="inline-start" /> 图片转换
									</Button>
									<Button
										size="sm"
										variant={activeTab === "compress" ? "default" : "ghost"}
										onClick={() => setActiveTab("compress")}
										disabled={isAnyProcessing}
									>
										<Minimize2 data-icon="inline-start" /> 图片压缩
									</Button>
									<Button
										size="sm"
										variant={activeTab === "icons" ? "default" : "ghost"}
										onClick={() => setActiveTab("icons")}
										disabled={isAnyProcessing}
									>
										<ImageIcon data-icon="inline-start" /> 图标生成
									</Button>
								</div>

								{!isIconTab && (
									<div className="flex flex-wrap items-center gap-4">
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												尺寸预设:
											</span>
											<Select
												value={selectedPreset}
												onValueChange={setSelectedPreset}
												disabled={isAnyProcessing}
											>
												<SelectTrigger className="h-8 w-[190px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{DEFAULT_CONFIG.size_presets.map((p, i) => (
														<SelectItem key={i} value={i.toString()}>
															{p.name}
															{p.name !== "自定义" && p.width !== 0
																? ` (${p.width}x${p.height})`
																: ""}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{isCustom && (
											<div className="animate-in fade-in zoom-in-95 duration-200 flex items-center gap-2">
												<Input
													type="number"
													value={customSize.width}
													onChange={(e) =>
														setCustomSize((prev) => ({
															...prev,
															width: parseInt(e.target.value) || 0,
														}))
													}
													className="h-8 w-16 text-xs"
													placeholder="宽"
												/>
												<span className="text-xs text-muted-foreground">x</span>
												<Input
													type="number"
													value={customSize.height}
													onChange={(e) =>
														setCustomSize((prev) => ({
															...prev,
															height: parseInt(e.target.value) || 0,
														}))
													}
													className="h-8 w-16 text-xs"
													placeholder="高"
												/>
											</div>
										)}

										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												目标格式:
											</span>
											<Select
												value={targetFormat}
												onValueChange={setTargetFormat}
												disabled={isAnyProcessing}
											>
												<SelectTrigger className="h-8 w-[130px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{DEFAULT_CONFIG.image_formats.map((f) => (
														<SelectItem key={f.value} value={f.value}>
															{f.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								)}

								{isCompressTab && (
									<div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												压缩质量:
											</span>
											<Select
												value={selectedQuality}
												onValueChange={setSelectedQuality}
												disabled={isAnyProcessing}
											>
												<SelectTrigger className="h-8 w-[190px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{DEFAULT_CONFIG.compression_presets.map((p) => (
														<SelectItem
															key={p.value}
															value={p.value.toString()}
														>
															{p.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">
												PNG 模式:
											</span>
											<Select
												value={pngCompressionMode}
												onValueChange={(value) =>
													setPngCompressionMode(value as PngCompressionMode)
												}
												disabled={isAnyProcessing}
											>
												<SelectTrigger className="h-8 w-[220px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="lossless">
														无损 (oxipng)
													</SelectItem>
													<SelectItem value="lossy">
														有损 (pngquant → oxipng)
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
								)}

								{isIconTab && (
									<ImageIconTab
										selectedPlatforms={selectedIconPlatforms}
										onTogglePlatform={toggleIconPlatform}
										disabled={isAnyProcessing}
									/>
								)}
							</div>

							<Button
								onClick={handleBatchDownload}
								variant="outline"
								size="sm"
								disabled={!tasks.some((t) => t.status === "completed")}
								className="shrink-0"
							>
								<Download data-icon="inline-start" /> 批量导出
							</Button>
						</div>
					</CardContent>
				</Card>

				<div className="flex-1 space-y-3 overflow-y-auto pr-2">
					{tasks.length === 0 ? (
						<TaskEmptyState
							icon={ImageIcon}
							title="暂无任务"
							description="点击上方按钮或拖拽图片文件开始"
						/>
					) : (
						tasks.map((task) => (
							<div
								key={task.id}
								className={cn(
									"task-item-animate flex items-center justify-between rounded-lg border p-4 transition-all",
									task.status === "processing" || task.status === "converting"
										? "border-primary/20 bg-primary/5"
										: "border-border bg-muted/30",
								)}
							>
								<div className="flex gap-4 flex-1 min-w-0">
									<MediaPreviewDialog
										type="image"
										path={task.path}
										fileName={task.fileName}
									>
										<div className="size-16 bg-muted rounded flex items-center justify-center overflow-hidden shrink-0 border shadow-sm cursor-zoom-in group relative">
											{task.thumbnail ? (
												<img
													src={task.thumbnail}
													alt="预览"
													className="w-full h-full object-cover transition-transform group-hover:scale-110"
												/>
											) : (
												<ImageIcon className="size-6 text-muted-foreground/20" />
											)}
											<div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
												<ImageIcon className="size-4 text-white" />
											</div>
										</div>
									</MediaPreviewDialog>

									<div className="mr-4 min-w-0 flex-1">
										<h3 className="truncate text-sm font-semibold">
											{task.fileName}
										</h3>
										<div className="mt-1 flex flex-wrap items-center gap-2">
											{task.info ? (
												task.info.format !== "unknown" ? (
													<>
														<Badge
															variant="secondary"
															className="h-4 px-1 text-[10px]"
															title="格式"
														>
															{task.info.format.toUpperCase()}
														</Badge>
														<span
															className="text-[11px] text-muted-foreground"
															title="分辨率"
														>
															{task.info.video?.width} x{" "}
															{task.info.video?.height}
														</span>
														<span className="text-[11px] text-muted-foreground/60">
															•
														</span>
														<span
															className="text-[11px] text-muted-foreground"
															title="文件大小"
														>
															{formatBytes(task.info.size)}
														</span>
													</>
												) : (
													<span className="text-[11px] text-muted-foreground">
														未知格式
													</span>
												)
											) : (
												<span className="animate-pulse text-[11px] text-muted-foreground">
													正在读取信息...
												</span>
											)}
										</div>
										<p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/50">
											{task.path}
										</p>
									</div>
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
									showOpenFolder={task.status === "completed"}
									onOpenFolder={() => handleOpenFolder(task.output)}
									onRemove={() => handleRemoveTask(task.id)}
								/>
							</div>
						))
					)}
				</div>
			</main>
		</div>
	);
}
