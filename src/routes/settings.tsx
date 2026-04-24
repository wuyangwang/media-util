import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
	Monitor,
	Moon,
	Sun,
	FolderOpen,
	Info,
	ExternalLink,
	Zap,
	Cpu,
	Copy,
	FileText,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useRef, useCallback, useEffect, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useAppSettings, useTranscriptionSettings } from "@/lib/store";
import { toast } from "sonner";
import { useUIStore } from "@/hooks/useUIStore";

const MODEL_DESCRIPTIONS: Record<string, string> = {
	"whisper-medium": "平衡速度与准确度，适合大多数日常转写任务。",
	"whisper-large": "准确率更高，适合复杂语音或高质量识别场景。",
	"sense-voice": "轻量高效，适合快速转写与资源受限设备。",
};

export const Route = createFileRoute("/settings")({
	component: Settings,
});

function Settings() {
	const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
	const {
		concurrency,
		setConcurrency,
		theme: savedTheme,
		setTheme: setSavedTheme,
	} = useAppSettings();
	const { modelId, setModelId } = useTranscriptionSettings();
	const [models, setModels] = useState<
		{
			id: string;
			label: string;
			downloaded: boolean;
			status: string;
			path?: string;
		}[]
	>([]);
	const [downloadProgressByModel, setDownloadProgressByModel] = useState<
		Record<string, number>
	>({});
	const [downloadStateByModel, setDownloadStateByModel] = useState<
		Record<string, string>
	>({});
	const [deletingModelIds, setDeletingModelIds] = useState<
		Record<string, boolean>
	>({});
	const systemInfo = useUIStore((state) => state.systemInfo);
	const systemInfoLoading = useUIStore((state) => state.systemInfoLoading);
	const fetchSystemInfo = useUIStore((state) => state.fetchSystemInfo);
	const containerRef = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);
	const sysInfo =
		systemInfo ??
		(systemInfoLoading
			? {
					osType: "加载中...",
					osVersion: "",
					arch: "加载中...",
					host: "加载中...",
					totalMemoryBytes: 0,
					availableMemoryBytes: 0,
					totalDiskBytes: 0,
					availableDiskBytes: 0,
					cpuModel: "加载中...",
					cpuCores: 0,
					gpuModel: "加载中...",
				}
			: {
					osType: "Unknown OS",
					osVersion: "Unknown",
					arch: "unknown",
					host: "Unknown",
					totalMemoryBytes: 0,
					availableMemoryBytes: 0,
					totalDiskBytes: 0,
					availableDiskBytes: 0,
					cpuModel: "Unknown",
					cpuCores: 0,
					gpuModel: "Unknown",
				});

	useEffect(() => {
		setMounted(true);
		const timer = window.setTimeout(() => {
			void fetchSystemInfo();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [fetchSystemInfo]);

	const refreshTranscriptionModels = useCallback(async () => {
		try {
			const statuses = await invoke<
				{
					id: string;
					label: string;
					downloaded: boolean;
					status: string;
					path?: string;
				}[]
			>("get_transcription_models_status");
			setModels(statuses);
		} catch (error) {
			toast.error(`读取转写模型状态失败: ${error}`);
		}
	}, []);

	const handleDownloadModel = useCallback(
		async (targetModelId: string) => {
			try {
				setDownloadStateByModel((prev) => ({
					...prev,
					[targetModelId]: "downloading",
				}));
				setDownloadProgressByModel((prev) => ({
					...prev,
					[targetModelId]: 0,
				}));

				await invoke("download_transcription_model", {
					modelId: targetModelId,
				});
				await refreshTranscriptionModels();
				toast.success("模型下载完成");
			} catch (error) {
				setDownloadStateByModel((prev) => ({
					...prev,
					[targetModelId]: "failed",
				}));
				toast.error(`模型下载失败: ${error}`);
			}
		},
		[refreshTranscriptionModels],
	);

	const handleDeleteModel = useCallback(
		async (targetModelId: string, label: string) => {
			const confirmed = window.confirm(`确认删除模型“${label}”吗？`);
			if (!confirmed) return;

			try {
				setDeletingModelIds((prev) => ({ ...prev, [targetModelId]: true }));
				await invoke("delete_transcription_model", {
					modelId: targetModelId,
				});
				setDownloadProgressByModel((prev) => ({ ...prev, [targetModelId]: 0 }));
				setDownloadStateByModel((prev) => ({
					...prev,
					[targetModelId]: "missing",
				}));
				await refreshTranscriptionModels();
				toast.success("模型已删除");
			} catch (error) {
				toast.error(`删除模型失败: ${error}`);
			} finally {
				setDeletingModelIds((prev) => ({ ...prev, [targetModelId]: false }));
			}
		},
		[refreshTranscriptionModels],
	);

	useEffect(() => {
		refreshTranscriptionModels();
	}, [refreshTranscriptionModels]);

	useEffect(() => {
		let unlistenFn: (() => void) | undefined;
		listen<{
			model_id: string;
			progress: number;
			status: string;
			message?: string;
		}>("model-download-progress", (event) => {
			const { model_id, progress, status } = event.payload;
			setDownloadProgressByModel((prev) => ({
				...prev,
				[model_id]: progress,
			}));
			setDownloadStateByModel((prev) => ({
				...prev,
				[model_id]: status,
			}));
		}).then((fn) => {
			unlistenFn = fn;
		});

		return () => {
			unlistenFn?.();
		};
	}, []);

	const formatBytes = useCallback((bytes: number) => {
		if (!bytes) {
			return "Unknown";
		}

		const units = ["B", "KB", "MB", "GB", "TB"];
		let value = bytes;
		let index = 0;

		while (value >= 1024 && index < units.length - 1) {
			value /= 1024;
			index += 1;
		}

		return `${value.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
	}, []);

	const handleThemeChange = useCallback(
		(value: string) => {
			setNextTheme(value);
			setSavedTheme(value);
		},
		[setNextTheme, setSavedTheme],
	);
	const formatGb = useCallback((bytes: number) => {
		if (!bytes) {
			return "Unknown";
		}
		const gb = bytes / (1024 * 1024 * 1024);
		return `${gb.toFixed(1)} GB`;
	}, []);
	const handleCopySysInfo = useCallback(async () => {
		const text = [
			`操作系统: ${sysInfo.osType} ${sysInfo.osVersion}`.trim(),
			`主机名称: ${sysInfo.host}`,
			`架构类型: ${sysInfo.arch.toUpperCase()}`,
			`内存总量: ${formatBytes(sysInfo.totalMemoryBytes)}`,
			`可用内存: ${formatBytes(sysInfo.availableMemoryBytes)}`,
			`硬盘总量: ${formatGb(sysInfo.totalDiskBytes)}`,
			`可用硬盘: ${formatGb(sysInfo.availableDiskBytes)}`,
			`CPU 型号: ${sysInfo.cpuModel}`,
			`CPU 核心数: ${sysInfo.cpuCores || "Unknown"}`,
			`GPU 型号: ${sysInfo.gpuModel}`,
		].join("\n");
		try {
			await navigator.clipboard.writeText(text);
			toast.success("系统信息已复制");
		} catch (error) {
			console.error("Failed to copy system info:", error);
			toast.error("复制失败，请稍后重试");
		}
	}, [formatBytes, formatGb, sysInfo]);

	useGSAP(
		() => {
			gsap.from(".settings-animate", {
				y: 20,
				opacity: 0,
				stagger: 0.1,
				duration: 0.5,
				ease: "power2.out",
			});
		},
		{ scope: containerRef },
	);

	return (
		<div ref={containerRef} className="flex flex-col h-full bg-background">
			<header className="p-6 border-b settings-animate">
				<h2 className="text-2xl font-bold tracking-tight text-foreground">
					设置
				</h2>
				<p className="text-muted-foreground">
					自定义您的应用偏好、性能及查看运行环境信息。
				</p>
			</header>

			<div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full pb-20">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<Card className="settings-animate">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Sun className="size-5" />
								界面外观
							</CardTitle>
							<CardDescription>选择您喜欢的主题模式。</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-4">
								<span className="text-sm font-medium text-foreground">
									应用主题:
								</span>
								<Select
									value={mounted ? savedTheme || nextTheme : "system"}
									onValueChange={handleThemeChange}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="选择主题" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="light">
											<div className="flex items-center gap-2">
												<Sun className="size-4" />
												<span>浅色模式</span>
											</div>
										</SelectItem>
										<SelectItem value="dark">
											<div className="flex items-center gap-2">
												<Moon className="size-4" />
												<span>深色模式</span>
											</div>
										</SelectItem>
										<SelectItem value="system">
											<div className="flex items-center gap-2">
												<Monitor className="size-4" />
												<span>跟随系统</span>
											</div>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</CardContent>
					</Card>

					<Card className="settings-animate border-primary/20 shadow-sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Zap className="size-5 text-primary" />
								性能设置
							</CardTitle>
							<CardDescription>管理转换任务的并行处理能力。</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-4">
								<span className="text-sm font-medium text-foreground">
									并行任务数:
								</span>
								<Select
									value={concurrency.toString()}
									onValueChange={(v) => setConcurrency(parseInt(v))}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="并发任务数" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="1">1 (低占用)</SelectItem>
										<SelectItem value="2">2 (推荐)</SelectItem>
										<SelectItem value="3">3 (多线程)</SelectItem>
										<SelectItem value="4">4 (全速)</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</CardContent>
					</Card>
				</div>

				<Card className="settings-animate bg-muted/30 border-dashed">
					<CardHeader>
						<div className="flex items-center justify-between gap-3">
							<CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
								<Cpu className="size-4" />
								系统运行环境
							</CardTitle>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8"
								onClick={handleCopySysInfo}
								disabled={!systemInfo}
							>
								<Copy className="size-3.5" />
								一键复制
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8">
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									操作系统
								</p>
								<p className="text-sm font-medium">
									{sysInfo.osType} {sysInfo.osVersion}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									主机名称
								</p>
								<p
									className="text-sm font-medium truncate"
									title={sysInfo.host}
								>
									{sysInfo.host}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									架构类型
								</p>
								<p className="text-sm font-medium">
									{sysInfo.arch.toUpperCase()}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									内存总量
								</p>
								<p className="text-sm font-medium">
									{formatBytes(sysInfo.totalMemoryBytes)}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									可用内存
								</p>
								<p className="text-sm font-medium">
									{formatBytes(sysInfo.availableMemoryBytes)}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									硬盘总量
								</p>
								<p className="text-sm font-medium">
									{formatGb(sysInfo.totalDiskBytes)}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									可用硬盘
								</p>
								<p className="text-sm font-medium">
									{formatGb(sysInfo.availableDiskBytes)}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									CPU 型号
								</p>
								<p
									className="text-sm font-medium truncate"
									title={sysInfo.cpuModel}
								>
									{sysInfo.cpuModel}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									CPU 核心数
								</p>
								<p className="text-sm font-medium">
									{sysInfo.cpuCores || "Unknown"}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[11px] text-muted-foreground uppercase">
									GPU 型号
								</p>
								<p
									className="text-sm font-medium truncate"
									title={sysInfo.gpuModel}
								>
									{sysInfo.gpuModel}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="settings-animate">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="size-5" />
							转写设置
						</CardTitle>
						<CardDescription>
							在此管理模型下载与默认转写参数，转写页面会直接使用这些配置。
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex flex-wrap items-center gap-4">
							<span className="text-sm font-medium shrink-0 text-foreground">
								当前启用模型:
							</span>
							<div className="w-[220px]">
								<Select
									value={modelId}
									onValueChange={(value) =>
										setModelId(
											value as
												| "whisper-medium"
												| "whisper-large"
												| "sense-voice",
										)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="选择模型" />
									</SelectTrigger>
									<SelectContent>
										{models.map((model) => (
											<SelectItem key={model.id} value={model.id}>
												{model.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<Badge
								variant={
									models.find((model) => model.id === modelId)?.downloaded
										? "secondary"
										: "outline"
								}
							>
								{models.find((model) => model.id === modelId)?.downloaded
									? "可用"
									: "未下载"}
							</Badge>
						</div>

						<div className="space-y-3">
							{models.map((model) => (
								<div
									key={model.id}
									className="rounded-md border bg-muted/20 p-3 space-y-2"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">{model.label}</span>
											<Badge
												variant={model.downloaded ? "secondary" : "outline"}
											>
												{model.downloaded ? "已下载" : "未下载"}
											</Badge>
										</div>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												model.downloaded
													? handleDeleteModel(model.id, model.label)
													: handleDownloadModel(model.id)
											}
											disabled={
												downloadStateByModel[model.id] === "downloading" ||
												deletingModelIds[model.id]
											}
										>
											{model.downloaded ? "删除" : "下载/更新"}
										</Button>
									</div>
									{downloadStateByModel[model.id] === "downloading" && (
										<Progress value={downloadProgressByModel[model.id] || 0} />
									)}
									<div className="text-[11px] leading-5 text-muted-foreground">
										{MODEL_DESCRIPTIONS[model.id] || "通用语音转写模型。"}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				<Card className="settings-animate">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FolderOpen className="size-5" />
							路径设置
						</CardTitle>
						<CardDescription>自定义转换后文件的保存位置。</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center gap-4">
							<span className="text-sm font-medium shrink-0 text-foreground">
								默认输出目录:
							</span>
							<div className="flex-1 p-2 bg-muted rounded-md border text-sm font-mono truncate text-muted-foreground">
								与源文件相同 (子目录: media-convert)
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="settings-animate">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Info className="size-5" />
							关于应用
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">应用版本:</span>
							<span className="font-medium text-foreground">
								v{import.meta.env.APP_VERSION}
							</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">核心引擎:</span>
							<span className="font-medium text-foreground">
								FFmpeg & Rust image crate
							</span>
						</div>
						<div className="flex justify-between items-center text-sm pt-2 border-t border-muted">
							<span className="text-muted-foreground">开源社区:</span>
							<Button
								variant="link"
								size="sm"
								className="h-auto p-0 text-primary font-medium flex items-center gap-1.5"
								onClick={() =>
									openUrl("https://github.com/wuyangwang/media-util")
								}
							>
								<ExternalLink className="size-3.5" />
								GitHub Repository
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
