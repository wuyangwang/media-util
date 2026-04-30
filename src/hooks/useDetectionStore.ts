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
	csvPath?: string;
	classStats?: Array<{
		classId: number;
		className: string;
		detections: number;
		frameHits: number;
		avgConfidence: number;
	}>;
	log?: string;
}

interface DetectionState {
	tasks: DetectionTask[];
	processing: boolean;
	recoveredCount: number;
	setRecoveredCount: (count: number) => void;
	setProcessing: (processing: boolean) => void;
	consumeRecoveredCount: () => number;
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
			recoveredCount: 0,
			setRecoveredCount: (recoveredCount) => set({ recoveredCount }),
			setProcessing: (processing) => set({ processing }),
			consumeRecoveredCount: () => {
				let count = 0;
				set((state) => {
					count = state.recoveredCount;
					return { recoveredCount: 0 };
				});
				return count;
			},
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
					let recoveredCount = 0;
					state.setTasks((prev) =>
						prev.map((task) =>
							task.status === "processing"
								? ((recoveredCount += 1),
									{ ...task, status: "pending", progress: 0 })
								: task,
						),
					);
					state.setProcessing(false);
					if (recoveredCount > 0) {
						state.setRecoveredCount(recoveredCount);
					}
				}
			},
		},
	),
);
