import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export interface Task {
	id: string;
	path: string;
	fileName: string;
	status: "待处理" | "正在处理..." | "正在转换..." | "已完成" | "失败";
	output?: string;
	progress?: number;
}

export function useTasks<T extends Task>(mode: "video" | "image") {
	const [tasks, setTasks] = useState<T[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const tasksRef = useRef<T[]>(tasks);

	tasksRef.current = tasks;

	const handleAddPaths = useCallback(async (paths: string[]) => {
		setIsScanning(true);
		const toastId = toast.loading(`正在扫描${mode === "video" ? "视频" : "图片"}文件...`);
		let addedCount = 0;
		const newTasks: T[] = [];

		try {
			for (const path of paths) {
				const files = await invoke<string[]>("scan_directory", {
					path,
					mode,
				});
				for (const file of files) {
					if (tasksRef.current.find((t) => t.path === file)) continue;
					const fileName = file.split(/[\\/]/).pop() || file;
					newTasks.push({
						id: Math.random().toString(36).substring(7),
						path: file,
						fileName,
						status: "待处理",
					} as T);
					addedCount++;
				}
			}
			if (newTasks.length > 0) {
				setTasks((prev) => [...prev, ...newTasks]);
				toast.success(`成功添加 ${addedCount} 个文件`, { id: toastId });
			} else {
				toast.info("未发现新的可处理文件", { id: toastId });
			}
		} catch (err) {
			toast.error(`添加失败: ${err}`, { id: toastId });
		} finally {
			setIsScanning(false);
		}
	}, [mode]);

	const removeTask = useCallback((id: string) => {
		setTasks((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const clearTasks = useCallback(() => {
		setTasks([]);
	}, []);

	return {
		tasks,
		setTasks,
		isScanning,
		handleAddPaths,
		removeTask,
		clearTasks
	};
}
