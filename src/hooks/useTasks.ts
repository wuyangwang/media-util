import { useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTaskStore } from "./useTaskStore";

export interface Task {
	id: string;
	path: string;
	fileName: string;
	status: "待处理" | "正在处理..." | "正在转换..." | "已完成" | "失败";
}

export function useTasks<T extends Task>(mode: "video" | "image") {
	const {
		imageTasks,
		videoTasks,
		imageProcessing,
		videoProcessing,
		setImageProcessing,
		setVideoProcessing,
		setImageTasks,
		setVideoTasks,
		addImageTasks,
		addVideoTasks,
		removeImageTask,
		removeVideoTask,
		clearImageTasks,
		clearVideoTasks,
	} = useTaskStore();

	const tasks = (mode === "image" ? imageTasks : videoTasks) as T[];
	const setTasks = (mode === "image" ? setImageTasks : setVideoTasks) as (
		tasks: T[] | ((prev: T[]) => T[]),
	) => void;
	const processing = mode === "image" ? imageProcessing : videoProcessing;
	const isAnyProcessing = imageProcessing || videoProcessing;
	const setProcessing = mode === "image" ? setImageProcessing : setVideoProcessing;
	const addTasks = (mode === "image" ? addImageTasks : addVideoTasks) as (tasks: T[]) => void;
	const removeTask = mode === "image" ? removeImageTask : removeVideoTask;
	const clearTasks = mode === "image" ? clearImageTasks : clearVideoTasks;

	const [isScanning, setIsScanning] = useState(false);
	const tasksRef = useRef<T[]>(tasks);
	tasksRef.current = tasks;

	const handleAddPaths = useCallback(
		async (paths: string[]) => {
			if (isAnyProcessing) {
				toast.error("有任务正在处理中，请稍后再添加");
				return;
			}
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
							...(mode === "video" ? { progress: 0 } : {}),
						} as unknown as T);
						addedCount++;
					}
				}
				if (newTasks.length > 0) {
					addTasks(newTasks);
					toast.success(`成功添加 ${addedCount} 个文件`, { id: toastId });
				} else {
					toast.info("未发现新的可处理文件", { id: toastId });
				}
			} catch (err) {
				toast.error(`添加失败: ${err}`, { id: toastId });
			} finally {
				setIsScanning(false);
			}
		},
		[mode, addTasks],
	);

	return {
		tasks,
		setTasks,
		processing,
		isAnyProcessing,
		setProcessing,
		isScanning,
		handleAddPaths,
		removeTask,
		clearTasks,
	};
}
