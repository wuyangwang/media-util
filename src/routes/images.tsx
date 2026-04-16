import { createFileRoute } from "@tanstack/react-router";
import { useRef, useCallback, useState } from "react";
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
import { toast } from "sonner";
import {
	Trash2,
	Play,
	Plus,
	FolderPlus,
	XCircle,
	Download,
	FolderOpen,
} from "lucide-react";
import { DEFAULT_CONFIG } from "@/lib/config";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useTasks, Task } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

interface ImageTask extends Task {
	output?: string;
}

export const Route = createFileRoute("/images")({
	component: Images,
});

function Images() {
	const { tasks, setTasks, isScanning, handleAddPaths, removeTask, clearTasks } = useTasks<ImageTask>("image");
	const [targetFormat, setTargetFormat] = useState(DEFAULT_CONFIG.image_formats[0]?.value || "");
	const [processing, setProcessing] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useGSAP(() => {
		gsap.from(".header-animate > *", {
			y: -20, opacity: 0, stagger: 0.1, duration: 0.5, ease: "power2.out"
		});
	}, { scope: containerRef });

	useGSAP(() => {
		if (tasks.length > 0) {
			gsap.from(".task-item-animate:last-child", {
				x: 20, opacity: 0, duration: 0.4, ease: "power2.out"
			});
		}
	}, { dependencies: [tasks.length], scope: containerRef });

	const handlePickFiles = useCallback(async () => {
		const files = await open({
			multiple: true,
			filters: [{ name: "图片", extensions: DEFAULT_CONFIG.image_extensions }],
		});
		if (files) await handleAddPaths(Array.isArray(files) ? files : [files]);
	}, [handleAddPaths]);

	const handlePickDir = useCallback(async () => {
		const dir = await open({ directory: true });
		if (dir) await handleAddPaths([dir as string]);
	}, [handleAddPaths]);

	const startBatch = useCallback(async () => {
		if (tasks.length === 0 || processing) return;
		setProcessing(true);
		
		for (const task of tasks) {
			if (task.status === "已完成") continue;
			setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "正在处理..." } : t));
			try {
				const outputPath = await invoke<string>("get_formatted_output_path", { 
                    inputPath: task.path, 
                    operation: "fixed", 
                    extension: targetFormat 
                });
				await invoke("crop_image_fixed", { inputPath: task.path, outputPath, presetIndex: 0 });
				setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "已完成", output: outputPath } : t));
			} catch (err) {
				setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "失败" } : t));
				toast.error(`任务 ${task.fileName} 失败: ${err}`);
			}
		}
		setProcessing(false);
	}, [processing, tasks, targetFormat, setTasks]);

	const handleBatchDownload = useCallback(async () => {
		const completedTasks = tasks.filter(t => t.status === "已完成" && t.output);
		if (completedTasks.length === 0) { toast.error("没有可下载的任务"); return; }
		const filePath = await save({ filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }], defaultPath: "images_batch.zip" });
		if (!filePath) return;
		try {
			await invoke("batch_to_zip", { filePaths: completedTasks.map((t) => t.output!), outputZipPath: filePath });
			toast.success(`文件已保存到: ${filePath}`);
		} catch (err) { toast.error(`打包失败: ${err}`); }
	}, [tasks]);

	const handleOpenFolder = useCallback(async (path?: string) => {
		if (path) try { await revealItemInDir(path); } catch (err) { toast.error(`打开文件夹失败: ${err}`); }
	}, []);

	return (
		<div ref={containerRef} className="flex flex-col h-full bg-background">
			<header className="p-6 border-b flex justify-between items-center header-animate">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">批量图片转换</h2>
					<p className="text-muted-foreground text-sm">{isScanning ? "正在扫描目录..." : "拖拽图片文件开始。"}</p>
				</div>
				<div className="flex gap-2">
					<Button onClick={handlePickFiles} variant="outline" size="sm" disabled={isScanning || processing}><Plus data-icon="inline-start" /> 添加图片</Button>
					<Button onClick={handlePickDir} variant="outline" size="sm" disabled={isScanning || processing}><FolderPlus data-icon="inline-start" /> 添加文件夹</Button>
					<Button onClick={startBatch} disabled={processing || tasks.length === 0 || isScanning} size="sm"><Play data-icon="inline-start" /> 全部开始</Button>
					<Button onClick={clearTasks} variant="ghost" size="sm" className="text-destructive" disabled={processing || isScanning}><XCircle data-icon="inline-start" /> 清空</Button>
				</div>
			</header>

			<main className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
				<Card className="shrink-0 header-animate">
					<CardContent className="p-4 flex flex-col gap-4">
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-4">
								<span className="text-sm font-medium">目标格式:</span>
								<Select value={targetFormat} onValueChange={setTargetFormat} disabled={processing}>
									<SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
									<SelectContent>{DEFAULT_CONFIG.image_formats.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
								</Select>
							</div>
							<Button onClick={handleBatchDownload} variant="outline" size="sm" disabled={processing || !tasks.some(t => t.status === "已完成")}><Download data-icon="inline-start" /> 批量下载</Button>
						</div>
					</CardContent>
				</Card>

				<div className="flex-1 overflow-y-auto space-y-3 pr-2">
					{tasks.map(task => (
						<div key={task.id} className={cn("task-item-animate p-4 border rounded-lg flex justify-between items-center transition-all", task.status === "正在处理..." || task.status === "正在转换..." ? "bg-primary/5 border-primary/20 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.1)]" : "bg-muted/30 border-border")}>
							<div className="flex-1 min-w-0 mr-4">
								<h3 className="text-sm font-semibold truncate">{task.fileName}</h3>
								<p className="text-xs text-muted-foreground truncate font-mono">{task.path}</p>
							</div>
							<div className="flex items-center gap-2">
								<span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${task.status === "已完成" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{task.status}</span>
								{task.status === "已完成" && <Button variant="ghost" size="icon-sm" onClick={() => handleOpenFolder(task.output)}><FolderOpen /></Button>}
								<Button variant="ghost" size="icon-sm" onClick={() => removeTask(task.id)}><Trash2 /></Button>
							</div>
						</div>
					))}
				</div>
			</main>
		</div>
	);
}
