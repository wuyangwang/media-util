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

interface TaskState {
	imageTasks: ImageTask[];
	videoTasks: VideoTask[];
	imageProcessing: boolean;
	videoProcessing: boolean;
	setImageProcessing: (processing: boolean) => void;
	setVideoProcessing: (processing: boolean) => void;
	setImageTasks: (
		tasks: ImageTask[] | ((prev: ImageTask[]) => ImageTask[]),
	) => void;
	setVideoTasks: (
		tasks: VideoTask[] | ((prev: VideoTask[]) => VideoTask[]),
	) => void;
	addImageTasks: (tasks: ImageTask[]) => void;
	addVideoTasks: (tasks: VideoTask[]) => void;
	removeImageTask: (id: string) => void;
	removeVideoTask: (id: string) => void;
	clearImageTasks: () => void;
	clearVideoTasks: () => void;
}

export const useTaskStore = create<TaskState>()(
	persist(
		(set) => ({
			imageTasks: [],
			videoTasks: [],
			imageProcessing: false,
			videoProcessing: false,
			setImageProcessing: (imageProcessing) => set({ imageProcessing }),
			setVideoProcessing: (videoProcessing) => set({ videoProcessing }),
			setImageTasks: (tasks) =>
				set((state) => ({
					imageTasks: typeof tasks === "function" ? tasks(state.imageTasks) : tasks,
				})),
			setVideoTasks: (tasks) =>
				set((state) => ({
					videoTasks: typeof tasks === "function" ? tasks(state.videoTasks) : tasks,
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
		}),
		{
			name: "task-storage",
		},
	),
);
