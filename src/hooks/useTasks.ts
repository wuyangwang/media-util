import { useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTaskStore } from "./useTaskStore";

export interface Task {
	id: string;
	path: string;
	fileName: string;
	status: "pending" | "processing" | "converting" | "completed" | "failed";
}

export const TASK_STATUS_LABELS: Record<Task["status"], string> = {
	pending: "待处理",
	processing: "正在处理...",
	converting: "正在转换...",
	completed: "已完成",
	failed: "失败",
};

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
	
	const [isScanning, setIsScanning] = useState(false);

	// Accurate check for any processing or scanning activity
	const isAnyProcessing = 
		imageProcessing || 
		videoProcessing || 
		isScanning || 
		[...imageTasks, ...videoTasks].some(t => 
			t.status === "processing" || 
			t.status === "converting"
		);
	
	const setProcessing =
		mode === "image" ? setImageProcessing : setVideoProcessing;
	const addTasks = (mode === "image" ? addImageTasks : addVideoTasks) as (
		tasks: T[],
	) => void;
	const removeTask = mode === "image" ? removeImageTask : removeVideoTask;
	const clearTasks = mode === "image" ? clearImageTasks : clearVideoTasks;

	const tasksRef = useRef<T[]>(tasks);
	tasksRef.current = tasks;

	const checkProcessing = useCallback(() => {
		if (isAnyProcessing) {
			toast.error("任务正在处理中，请稍后再试");
			return true;
		}
		return false;
	}, [isAnyProcessing]);

	const handleAddPaths = useCallback(
		async (paths: string[]) => {
			if (checkProcessing()) return;
			setIsScanning(true);
			const toastId = toast.loading(
				`正在扫描${mode === "video" ? "视频" : "图片"}文件...`,
			);
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
							fileName: fileName,
							status: "pending",
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
		[mode, addTasks, isAnyProcessing],
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
		checkProcessing,
	};
}
