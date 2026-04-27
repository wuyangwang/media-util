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
	setImageProcessing: (processing: boolean) => void;
	setVideoProcessing: (processing: boolean) => void;
	setTranscribeProcessing: (processing: boolean) => void;
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
			setImageProcessing: (imageProcessing) => set({ imageProcessing }),
			setVideoProcessing: (videoProcessing) => set({ videoProcessing }),
			setTranscribeProcessing: (transcribeProcessing) =>
				set({ transcribeProcessing }),
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
					// 应用启动时清空所有任务列表
					state.setImageTasks([]);
					state.setVideoTasks([]);
					state.setTranscribeTask(null);
					// 确保应用启动时处理状态为 false
					state.setVideoProcessing(false);
					state.setImageProcessing(false);
					state.setTranscribeProcessing(false);
				}
			},
		},
	),
);
