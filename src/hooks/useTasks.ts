import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTaskStore } from "./useTaskStore";

export interface VideoInfo {
	width: number;
	height: number;
	codec: string;
	fps: string;
	bitrate?: string;
}

export interface MediaInfo {
	format: string;
	size: number;
	duration: number;
	video?: VideoInfo;
	error?: string;
}

export interface Task {
	id: string;
	path: string;
	fileName: string;
	status: "pending" | "processing" | "converting" | "completed" | "failed" | "info_failed";
	info?: MediaInfo;
	thumbnail?: string; // Base64 thumbnail for video or small preview for image
	log?: string; // Capture error logs or details
}

export interface ImageTask extends Task {
	output?: string;
}

export interface VideoTask extends Task {
	progress: number;
	outputPath?: string;
}

export const TASK_STATUS_LABELS: Record<Task["status"], string> = {
	pending: "待处理",
	processing: "正在处理...",
	converting: "正在转换...",
	completed: "已完成",
	failed: "失败",
	info_failed: "读取信息失败",
};

export function useTasks<T extends Task>(mode: "video" | "image") {
	// 1. Granular state selection to avoid unnecessary re-renders
	const tasks = useTaskStore(
		useCallback((state) => (mode === "image" ? state.imageTasks : state.videoTasks), [mode])
	) as T[];
	
	const processing = useTaskStore(
		useCallback((state) => (mode === "image" ? state.imageProcessing : state.videoProcessing), [mode])
	);

	// 2. Select specific actions
	const setProcessing = useTaskStore(
		useCallback((state) => (mode === "image" ? state.setImageProcessing : state.setVideoProcessing), [mode])
	);
	
	const setTasks = useTaskStore(
		useCallback((state) => (mode === "image" ? state.setImageTasks : state.setVideoTasks), [mode])
	) as (tasks: T[] | ((prev: T[]) => T[])) => void;

	const addTasks = useTaskStore(
		useCallback((state) => (mode === "image" ? state.addImageTasks : state.addVideoTasks), [mode])
	) as (tasks: T[]) => void;

	const removeTask = useTaskStore(
		useCallback((state) => (mode === "image" ? state.removeImageTask : state.removeVideoTask), [mode])
	);

	const clearTasks = useTaskStore(
		useCallback((state) => (mode === "image" ? state.clearImageTasks : state.clearVideoTasks), [mode])
	);

	const [isScanning, setIsScanning] = useState(false);

	// 3. Derived state for overall processing status
	// Subscribe only to specific flags and task statuses
	const hasActiveTasks = useTaskStore(
		useCallback((state) => 
			[...state.imageTasks, ...state.videoTasks].some(t => 
				t.status === "processing" || t.status === "converting"
			), [])
	);
	
	const imageProcessing = useTaskStore((state) => state.imageProcessing);
	const videoProcessing = useTaskStore((state) => state.videoProcessing);

	const isAnyProcessing = useMemo(() => 
		imageProcessing || videoProcessing || isScanning || hasActiveTasks,
		[imageProcessing, videoProcessing, isScanning, hasActiveTasks]
	);

	const tasksRef = useRef<T[]>(tasks);
	tasksRef.current = tasks;

	const fetchingIds = useRef(new Set<string>());

	const checkProcessing = useCallback(() => {
		if (isAnyProcessing) {
			toast.error("任务正在处理中，请稍后再试");
			return true;
		}
		return false;
	}, [isAnyProcessing]);

	const fetchMetadata = useCallback(
		async (taskIds: string[], initialTasks?: T[]) => {
			const toFetch = taskIds.filter((id) => !fetchingIds.current.has(id));
			if (toFetch.length === 0) return;

			toFetch.forEach((id) => fetchingIds.current.add(id));

			const CONCURRENCY_LIMIT = 3;
			const queue = [...toFetch];

			const runNext = async () => {
				if (queue.length === 0) return;

				const id = queue.shift()!;

				try {
					let currentTask = initialTasks?.find((t) => t.id === id);
					if (!currentTask) {
						currentTask = tasksRef.current.find((t) => t.id === id);
					}

					if (currentTask && !currentTask.info) {
						try {
							const info = await invoke<MediaInfo>("get_media_info", {
								path: currentTask.path,
							});

							let thumbnail: string | undefined;
							if (mode === "video") {
								try {
									const thumbPath = await invoke<string>("get_video_thumbnail", {
										path: currentTask.path,
									});
									// If it's a file path (doesn't start with data:), convert it
									thumbnail = thumbPath.startsWith("data:") 
										? thumbPath 
										: convertFileSrc(thumbPath);
								} catch (e) {
									console.error("Failed to get thumbnail:", e);
								}
							}

							setTasks((prev) =>
								prev.map((t) =>
									t.id === id
										? {
												...t,
												info,
												thumbnail,
												status:
													t.status === "info_failed" ? "pending" : t.status,
											}
										: t,
								),
							);
						} catch (err) {
							console.error(`Failed to fetch metadata for task ${id}:`, err);
							setTasks((prev) =>
								prev.map((t) =>
									t.id === id
										? {
												...t,
												status: "pending",
												info: {
													format: "unknown",
													size: 0,
													duration: 0,
													error: String(err),
												},
											}
										: t,
								),
							);
						}
					}
				} finally {
					fetchingIds.current.delete(id);
					await runNext();
				}
			};

			const initialRunners = [];
			for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, queue.length); i++) {
				initialRunners.push(runNext());
			}
			await Promise.all(initialRunners);
		},
		[mode, setTasks],
	);

	useEffect(() => {
		const pendingIds = tasks
			.filter(
				(t) =>
					t.status === "pending" && !t.info && !fetchingIds.current.has(t.id),
			)
			.map((t) => t.id);

		if (pendingIds.length > 0) {
			fetchMetadata(pendingIds);
		}
	}, [tasks, fetchMetadata]);

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
					// Start fetching metadata for new tasks, pass newTasks to avoid sync issues
					fetchMetadata(
						newTasks.map((t) => t.id),
						newTasks,
					);
				} else {
					toast.info("未发现新的可处理文件", { id: toastId });
				}
			} catch (err) {
				toast.error(`添加失败: ${err}`, { id: toastId });
			} finally {
				setIsScanning(false);
			}
		},
		[mode, addTasks, checkProcessing, fetchMetadata],
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
