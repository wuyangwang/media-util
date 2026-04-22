import { createFileRoute } from "@tanstack/react-router";
import { useRef, useCallback, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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
import {
	Trash2,
	Play,
	Plus,
	FolderPlus,
	XCircle,
	Download,
	FolderOpen,
	Loader2,
	Image as ImageIcon,
	Minimize2,
} from "lucide-react";
import { DEFAULT_CONFIG } from "@/lib/config";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useTasks, ImageTask, TASK_STATUS_LABELS } from "@/hooks/useTasks";
import { cn, formatBytes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/images")({
	component: Images,
});

type ImageFlowTab = "convert" | "compress";
type PngCompressionMode = "lossless" | "lossy";

function Images() {
	const {
		tasks,
		setTasks,
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
	const customPreset = useMemo(
		() => DEFAULT_CONFIG.size_presets.find((p) => p.name === "自定义"),
		[],
	);
	const [customSize, setCustomSize] = useState({
		width: customPreset?.width || 800,
		height: customPreset?.height || 800,
	});
	const containerRef = useRef<HTMLDivElement>(null);

	const isCustom = useMemo(() => {
		const preset = DEFAULT_CONFIG.size_presets[parseInt(selectedPreset)];
		return preset?.name === "自定义";
	}, [selectedPreset]);
	const isCompressTab = activeTab === "compress";

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
			filters: [{ name: "图片", extensions: DEFAULT_CONFIG.image_extensions }],
		});
		if (files) await handleAddPaths(Array.isArray(files) ? files : [files]);
	}, [handleAddPaths, checkProcessing]);

	const handlePickDir = useCallback(async () => {
		if (checkProcessing()) return;
		const dir = await open({ directory: true });
		if (dir) await handleAddPaths([dir as string]);
	}, [handleAddPaths, checkProcessing]);

	const handleStartTask = useCallback(
		async (task: ImageTask) => {
			const preset = DEFAULT_CONFIG.size_presets[parseInt(selectedPreset)];
			if (!preset) {
				toast.error("尺寸预设无效");
				return;
			}

			setTasks((prev) =>
				prev.map((t) =>
					t.id === task.id ? { ...t, status: "processing" } : t,
				),
			);
			try {
				const operation = isCompressTab
					? "compress"
					: isCustom
						? "custom"
						: preset.name === "原图尺寸"
							? "convert"
							: "fixed";

				const outputPath = await invoke<string>("get_formatted_output_path", {
					inputPath: task.path,
					operation,
					extension: targetFormat === "original" ? null : targetFormat,
				});

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
			selectedQuality,
			pngCompressionMode,
		],
	);

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
		<div ref={containerRef} className="flex h-full flex-col bg-background">
			<header className="header-animate flex items-center justify-between border-b p-6">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">批量图片处理</h2>
					<p className="text-sm text-muted-foreground">
						{isScanning ? "正在扫描目录..." : "拖拽图片文件开始。"}
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						onClick={handlePickFiles}
						variant="outline"
						size="sm"
						title={isAnyProcessing ? "正在处理中，无法添加图片" : "添加图片"}
					>
						{isScanning ? (
							<Loader2 className="mr-1 size-4 animate-spin" />
						) : (
							<Plus data-icon="inline-start" />
						)}
						添加图片
					</Button>
					<Button
						onClick={handlePickDir}
						variant="outline"
						size="sm"
						title={isAnyProcessing ? "正在处理中，无法添加文件夹" : "添加文件夹"}
					>
						{isScanning ? (
							<Loader2 className="mr-1 size-4 animate-spin" />
						) : (
							<FolderPlus data-icon="inline-start" />
						)}
						添加文件夹
					</Button>
					<Button onClick={startBatch} size="sm">
						<Play data-icon="inline-start" /> 全部开始
					</Button>
					<Button
						onClick={handleClearTasks}
						variant="ghost"
						size="sm"
						className="text-destructive"
					>
						<XCircle data-icon="inline-start" /> 清空
					</Button>
				</div>
			</header>

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
								</div>

								<div className="flex flex-wrap items-center gap-4">
									<div className="flex items-center gap-2">
										<span className="text-xs text-muted-foreground">尺寸预设:</span>
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
										<span className="text-xs text-muted-foreground">目标格式:</span>
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

								{isCompressTab && (
									<div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">压缩质量:</span>
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
														<SelectItem key={p.value} value={p.value.toString()}>
															{p.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">PNG 模式:</span>
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
													<SelectItem value="lossless">无损 (oxipng)</SelectItem>
													<SelectItem value="lossy">
														有损 (pngquant → oxipng)
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
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
					{tasks.map((task) => (
						<div
							key={task.id}
							className={cn(
								"task-item-animate flex items-center justify-between rounded-lg border p-4 transition-all",
								task.status === "processing" || task.status === "converting"
									? "border-primary/20 bg-primary/5"
									: "border-border bg-muted/30",
							)}
						>
							<div className="mr-4 min-w-0 flex-1">
								<h3 className="truncate text-sm font-semibold">{task.fileName}</h3>
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
												<span className="text-[11px] text-muted-foreground" title="分辨率">
													{task.info.video?.width} x {task.info.video?.height}
												</span>
												<span className="text-[11px] text-muted-foreground/60">•</span>
												<span className="text-[11px] text-muted-foreground" title="文件大小">
													{formatBytes(task.info.size)}
												</span>
											</>
										) : (
											<span className="text-[11px] text-muted-foreground">未知格式</span>
										)
									) : (
										<span className="animate-pulse text-[11px] text-muted-foreground">正在读取信息...</span>
									)}
								</div>
								<p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/50">
									{task.path}
								</p>
							</div>

							<div className="ml-4 flex shrink-0 items-center gap-1.5">
								<span
									className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${task.status === "completed" ? "bg-green-100 text-green-700" : task.status === "failed" ? "bg-red-100 text-red-700" : task.status === "pending" ? "bg-blue-100 text-blue-700" : "bg-primary/10 text-primary animate-pulse"}`}
								>
									{TASK_STATUS_LABELS[task.status]}
								</span>

								{task.status !== "processing" && (
									<Button
										variant="ghost"
										size="icon-sm"
										className="h-8 w-8 text-primary hover:bg-primary/10"
										onClick={() => handleStartTask(task)}
										title={
											task.status === "failed"
												? "重新处理"
												: task.status === "completed"
													? "再次处理"
													: "开始处理"
										}
									>
										<Play className="size-4" />
									</Button>
								)}

								{task.status === "completed" && (
									<Button
										variant="ghost"
										size="icon-sm"
										className="h-8 w-8 text-primary hover:bg-primary/10"
										onClick={() => handleOpenFolder(task.output)}
										title="打开所在文件夹"
									>
										<FolderOpen className="size-4" />
									</Button>
								)}
								<Button
									variant="ghost"
									size="icon-sm"
									className="h-8 w-8 text-muted-foreground transition-colors hover:text-destructive"
									onClick={() => handleRemoveTask(task.id)}
									title="删除任务"
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						</div>
					))}
				</div>
			</main>
		</div>
	);
}
