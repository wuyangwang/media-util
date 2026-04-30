import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Task } from "./useTasks";

interface ImageTask extends Task {
	output?: string;
}

interface VideoTask extends Task {
	progress: number;
	outputPath?: string;
	log?: string;
}

export type TranscribeTaskStatus =
	| "pending"
	| "preparing"
	| "normalizing_audio"
	| "transcribing"
	| "completed"
	| "failed";

export interface TranscribeTask {
	id: string;
	path: string;
	fileName: string;
	status: TranscribeTaskStatus;
	progress: number;
	outputPath?: string;
	log?: string;
	transcript?: string;
	transcriptTimestamped?: string;
	duration?: string;
	startTime?: number;
}

export interface VideoProgressPayload {
	id: string;
	progress: number;
	status: string;
	log?: string;
}

interface TaskState {
	imageTasks: ImageTask[];
	videoTasks: VideoTask[];
	transcribeTask: TranscribeTask | null;
	imageProcessing: boolean;
	videoProcessing: boolean;
	transcribeProcessing: boolean;
	recoveredCount: number;
	setRecoveredCount: (count: number) => void;
	setImageProcessing: (processing: boolean) => void;
	setVideoProcessing: (processing: boolean) => void;
	setTranscribeProcessing: (processing: boolean) => void;
	consumeRecoveredCount: () => number;
	setImageTasks: (
		tasks: ImageTask[] | ((prev: ImageTask[]) => ImageTask[]),
	) => void;
	setVideoTasks: (
		tasks: VideoTask[] | ((prev: VideoTask[]) => VideoTask[]),
	) => void;
	setTranscribeTask: (
		task:
			| TranscribeTask
			| null
			| ((prev: TranscribeTask | null) => TranscribeTask | null),
	) => void;
	addImageTasks: (tasks: ImageTask[]) => void;
	addVideoTasks: (tasks: VideoTask[]) => void;
	removeImageTask: (id: string) => void;
	removeVideoTask: (id: string) => void;
	clearImageTasks: () => void;
	clearVideoTasks: () => void;
	clearTranscribeTask: () => void;
	applyVideoProgress: (payload: VideoProgressPayload) => void;
}

export const useTaskStore = create<TaskState>()(
	persist(
		(set) => ({
			imageTasks: [],
			videoTasks: [],
			transcribeTask: null,
			imageProcessing: false,
			videoProcessing: false,
			transcribeProcessing: false,
			recoveredCount: 0,
			setRecoveredCount: (recoveredCount) => set({ recoveredCount }),
			setImageProcessing: (imageProcessing) => set({ imageProcessing }),
			setVideoProcessing: (videoProcessing) => set({ videoProcessing }),
			setTranscribeProcessing: (transcribeProcessing) =>
				set({ transcribeProcessing }),
			consumeRecoveredCount: () => {
				let count = 0;
				set((state) => {
					count = state.recoveredCount;
					return { recoveredCount: 0 };
				});
				return count;
			},
			setImageTasks: (tasks) =>
				set((state) => ({
					imageTasks:
						typeof tasks === "function" ? tasks(state.imageTasks) : tasks,
				})),
			setVideoTasks: (tasks) =>
				set((state) => ({
					videoTasks:
						typeof tasks === "function" ? tasks(state.videoTasks) : tasks,
				})),
			setTranscribeTask: (task) =>
				set((state) => ({
					transcribeTask:
						typeof task === "function" ? task(state.transcribeTask) : task,
				})),
			addImageTasks: (tasks) =>
				set((state) => ({
					imageTasks: [...state.imageTasks, ...tasks],
				})),
			addVideoTasks: (tasks) =>
				set((state) => ({
					videoTasks: [...state.videoTasks, ...tasks],
				})),
			removeImageTask: (id) =>
				set((state) => ({
					imageTasks: state.imageTasks.filter((t) => t.id !== id),
				})),
			removeVideoTask: (id) =>
				set((state) => ({
					videoTasks: state.videoTasks.filter((t) => t.id !== id),
				})),
			clearImageTasks: () => set({ imageTasks: [] }),
			clearVideoTasks: () => set({ videoTasks: [] }),
			clearTranscribeTask: () => set({ transcribeTask: null }),
			applyVideoProgress: (payload) =>
				set((state) => {
					const videoTasks = state.videoTasks.map((task) => {
						if (task.id !== payload.id) return task;

						let status = task.status;
						if (payload.status === "Completed") status = "completed";
						else if (payload.status === "Failed") status = "failed";
						else status = "converting";

						return {
							...task,
							progress: payload.progress,
							status,
							log: payload.log || task.log,
						};
					});

					const hasActive = videoTasks.some(
						(task) =>
							task.status === "converting" || task.status === "processing",
					);

					return {
						videoTasks,
						videoProcessing: hasActive ? state.videoProcessing : false,
					};
				}),
		}),
		{
			name: "task-storage",
			onRehydrateStorage: () => (state) => {
				if (state) {
					let recoveredCount = 0;
					// 应用重启后保留任务，并将中断中的任务恢复为可继续状态
					state.setImageTasks((prev) =>
						prev.map((task) =>
							task.status === "processing" || task.status === "converting"
								? ((recoveredCount += 1), { ...task, status: "pending" })
								: task,
						),
					);
					state.setVideoTasks((prev) =>
						prev.map((task) =>
							task.status === "processing" || task.status === "converting"
								? ((recoveredCount += 1),
									{ ...task, status: "pending", progress: 0 })
								: task,
						),
					);
					state.setTranscribeTask((prev) => {
						if (!prev) return null;
						if (prev.status === "completed" || prev.status === "failed") {
							return prev;
						}
						recoveredCount += 1;
						return {
							...prev,
							status: "pending",
							progress: 0,
							startTime: undefined,
						};
					});

					// 应用启动时处理标记统一复位
					state.setVideoProcessing(false);
					state.setImageProcessing(false);
					state.setTranscribeProcessing(false);
					if (recoveredCount > 0) {
						state.setRecoveredCount(recoveredCount);
					}
				}
			},
		},
	),
);
