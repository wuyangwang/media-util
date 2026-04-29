import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DetectionTask {
	id: string;
	path: string;
	fileName: string;
	is_video: boolean;
	status: "pending" | "processing" | "completed" | "failed";
	progress: number;
	outputPath?: string;
	resultPath?: string;
	log?: string;
}

interface DetectionState {
	tasks: DetectionTask[];
	processing: boolean;
	setProcessing: (processing: boolean) => void;
	setTasks: (
		tasks: DetectionTask[] | ((prev: DetectionTask[]) => DetectionTask[]),
	) => void;
	addTask: (task: DetectionTask) => void;
	removeTask: (id: string) => void;
	clearTasks: () => void;
	updateTask: (id: string, updates: Partial<DetectionTask>) => void;
}

export const useDetectionStore = create<DetectionState>()(
	persist(
		(set) => ({
			tasks: [],
			processing: false,
			setProcessing: (processing) => set({ processing }),
			setTasks: (tasks) =>
				set((state) => ({
					tasks: typeof tasks === "function" ? tasks(state.tasks) : tasks,
				})),
			addTask: (task) =>
				set((state) => ({
					tasks: [...state.tasks, task],
				})),
			removeTask: (id) =>
				set((state) => ({
					tasks: state.tasks.filter((t) => t.id !== id),
				})),
			clearTasks: () => set({ tasks: [] }),
			updateTask: (id, updates) =>
				set((state) => ({
					tasks: state.tasks.map((t) =>
						t.id === id ? { ...t, ...updates } : t,
					),
				})),
		}),
		{
			name: "detection-storage",
			onRehydrateStorage: () => (state) => {
				if (state) {
					state.setTasks([]);
					state.setProcessing(false);
				}
			},
		},
	),
);
