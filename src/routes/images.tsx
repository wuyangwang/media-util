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
	const [targetFormat, setTargetFormat] = useState("png");
	const [selectedPreset, setSelectedPreset] = useState<string>("1");
	const [compressEnabled, setCompressEnabled] = useState(false);
	const [selectedQuality, setSelectedQuality] = useState<string>(
		DEFAULT_CONFIG.compression_presets[0]?.value.toString() || "80",
	);
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

	const startBatch = useCallback(async () => {
		if (checkProcessing()) return;
		if (tasks.length === 0) {
			toast.info("请先添加图片文件");
			return;
		}
		setProcessing(true);

		const preset = DEFAULT_CONFIG.size_presets[parseInt(selectedPreset)];
		const width = isCustom ? customSize.width : preset.width;
		const height = isCustom ? customSize.height : preset.height;
		const quality = compressEnabled ? parseInt(selectedQuality) : 100;

		for (const task of tasks) {
			setTasks((prev) =>
				prev.map((t) =>
					t.id === task.id ? { ...t, status: "processing" } : t,
				),
			);
			try {
				const operation = isCustom
					? "custom"
					: preset.name === "原图尺寸"
						? "convert"
						: "fixed";

				const outputPath = await invoke<string>("get_formatted_output_path", {
					inputPath: task.path,
					operation,
					extension: targetFormat === "original" ? null : targetFormat,
				});

				if (isCustom) {
					await invoke("crop_image_custom", {
						inputPath: task.path,
						outputPath,
						targetWidth: width,
						targetHeight: height,
						quality,
					});
				} else {
					await invoke("crop_image_fixed", {
						inputPath: task.path,
						outputPath,
						presetIndex: parseInt(selectedPreset),
						quality,
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
			}
		}
		setProcessing(false);
	}, [
		checkProcessing,
		tasks,
		targetFormat,
		selectedPreset,
		compressEnabled,
		selectedQuality,
		setTasks,
		isCustom,
		customSize,
		setProcessing,
	]);

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
		if (path)
			try {
				await revealItemInDir(path);
			} catch (err) {
				toast.error(`打开文件夹失败: ${err}`);
			}
	}, []);

	return (
		<div ref={containerRef} className="flex flex-col h-full bg-background">
			<header className="p-6 border-b flex justify-between items-center header-animate">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">批量图片处理</h2>
					<p className="text-muted-foreground text-sm">
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
							<Loader2 className="size-4 mr-1 animate-spin" />
						) : (
							<Plus data-icon="inline-start" />
						)}
						添加图片
					</Button>
					<Button
						onClick={handlePickDir}
						variant="outline"
						size="sm"
						title={
							isAnyProcessing ? "正在处理中，无法添加文件夹" : "添加文件夹"
						}
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
									: "开始执行"
						}
					>
						<Play data-icon="inline-start" /> 全部开始
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
					<CardContent className="p-4 flex flex-col gap-6">
						<div className="flex items-start justify-between gap-4">
							<div className="flex flex-col gap-6 flex-1">
								{/* 转换与尺寸设置 */}
								<div className="flex items-center gap-6">
									<div className="flex items-center gap-2 min-w-[80px]">
										<div className="w-1 h-4 bg-primary rounded-full" />
										<span className="text-sm font-bold">转换设置</span>
									</div>
									<div className="flex flex-wrap items-center gap-4">
										<div className="flex items-center gap-2">
											<span className="text-xs text-muted-foreground">尺寸预设:</span>
											<Select
												value={selectedPreset}
												onValueChange={setSelectedPreset}
												disabled={isAnyProcessing}
											>
												<SelectTrigger className="w-[180px] h-8 text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{DEFAULT_CONFIG.size_presets.map((p, i) => (
														<SelectItem key={i} value={i.toString()}>
															{p.name}{" "}
															{p.name !== "自定义" && p.width !== 0
																? `(${p.width}x${p.height})`
																: ""}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{isCustom && (
											<div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
												<Input
													type="number"
													value={customSize.width}
													onChange={(e) =>
														setCustomSize((prev) => ({
															...prev,
															width: parseInt(e.target.value) || 0,
														}))
													}
													className="w-16 h-8 text-xs"
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
													className="w-16 h-8 text-xs"
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
												<SelectTrigger className="w-[120px] h-8 text-xs">
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
								</div>

								<div className="h-px bg-border/60" />

								{/* 压缩设置 */}
								<div className="flex items-center gap-6">
									<div className="flex items-center gap-2 min-w-[80px]">
										<div className="w-1 h-4 bg-orange-500 rounded-full" />
										<span className="text-sm font-bold">压缩设置</span>
									</div>
									<div className="flex items-center gap-4">
										<Button
											variant={compressEnabled ? "default" : "outline"}
											size="sm"
											className={cn(
												"h-8 text-xs px-4 transition-all",
												compressEnabled ? "bg-orange-500 hover:bg-orange-600" : ""
											)}
											onClick={() => setCompressEnabled(!compressEnabled)}
											disabled={isAnyProcessing}
										>
											{compressEnabled ? "已启用压缩" : "未启用压缩"}
										</Button>

										{compressEnabled && (
											<div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
												<span className="text-xs text-muted-foreground">质量预设:</span>
												<Select
													value={selectedQuality}
													onValueChange={setSelectedQuality}
													disabled={isAnyProcessing}
												>
													<SelectTrigger className="w-[180px] h-8 text-xs">
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
										)}
									</div>
								</div>
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

				<div className="flex-1 overflow-y-auto space-y-3 pr-2">
					{tasks.map((task) => (
						<div
							key={task.id}
							className={cn(
								"task-item-animate p-4 border rounded-lg flex justify-between items-center transition-all",
								task.status === "processing" || task.status === "converting"
									? "bg-primary/5 border-primary/20 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.1)]"
									: "bg-muted/30 border-border",
							)}
						>
							<div className="flex-1 min-w-0 mr-4">
								<h3 className="text-sm font-semibold truncate">
									{task.fileName}
								</h3>
								<div className="flex flex-wrap items-center gap-2 mt-1">
									{task.info ? (
										task.info.format !== "unknown" ? (
											<>
												<Badge variant="secondary" className="text-[10px] h-4 px-1" title="格式">
													{task.info.format.toUpperCase()}
												</Badge>
												<span className="text-[11px] text-muted-foreground" title="分辨率">
													{task.info.video?.width} x {task.info.video?.height}
												</span>
												<span className="text-[11px] text-muted-foreground/60">
													•
												</span>
												<span className="text-[11px] text-muted-foreground" title="文件大小">
													{formatBytes(task.info.size)}
												</span>
											</>
										) : (
											<span className="text-[11px] text-muted-foreground">
												未知格式
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
							<div className="flex items-center gap-2">
								<span
									className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${task.status === "completed" ? "bg-green-100 text-green-700" : task.status === "failed" ? "bg-red-100 text-red-700" : task.status === "pending" ? "bg-blue-100 text-blue-700" : "bg-primary/10 text-primary animate-pulse"}`}
								>
									{TASK_STATUS_LABELS[task.status]}
								</span>
								{task.status === "completed" && (
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => handleOpenFolder(task.output)}
									>
										<FolderOpen />
									</Button>
								)}
								<Button
									variant="ghost"
									size="icon-sm"
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
					))}
				</div>
			</main>
		</div>
	);
}
