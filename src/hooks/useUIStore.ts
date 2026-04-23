import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SystemInfoState {
	osType: string;
	osVersion: string;
	arch: string;
	host: string;
	totalMemoryBytes: number;
	availableMemoryBytes: number;
	totalDiskBytes: number;
	availableDiskBytes: number;
	cpuModel: string;
	cpuCores: number;
	gpuModel: string;
}

const EMPTY_SYSTEM_INFO: SystemInfoState = {
	osType: "Unknown OS",
	osVersion: "Unknown",
	arch: "unknown",
	host: "Unknown",
	totalMemoryBytes: 0,
	availableMemoryBytes: 0,
	totalDiskBytes: 0,
	availableDiskBytes: 0,
	cpuModel: "Unknown",
	cpuCores: 0,
	gpuModel: "Unknown",
};

interface UIState {
	isSidebarCollapsed: boolean;
	systemInfo: SystemInfoState | null;
	systemInfoLoaded: boolean;
	systemInfoLoading: boolean;
	toggleSidebar: () => void;
	fetchSystemInfo: () => Promise<void>;
}

export const useUIStore = create<UIState>()(
	persist(
		(set, get) => ({
			isSidebarCollapsed: false,
			systemInfo: null,
			systemInfoLoaded: false,
			systemInfoLoading: false,
			toggleSidebar: () =>
				set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
			fetchSystemInfo: async () => {
				const { systemInfoLoaded, systemInfoLoading } = get();
				if (systemInfoLoaded || systemInfoLoading) {
					return;
				}

				set({ systemInfoLoading: true });
				try {
					const result = await invoke<{
						os_type: string;
						os_version: string;
						arch: string;
						host: string;
						total_memory_bytes: number;
						available_memory_bytes: number;
						total_disk_bytes: number;
						available_disk_bytes: number;
						cpu_model: string;
						cpu_cores: number;
						gpu_model: string;
					}>("get_system_info");

					set({
						systemInfo: {
							osType: result.os_type || "Unknown OS",
							osVersion: result.os_version || "Unknown",
							arch: result.arch || "unknown",
							host: result.host || "Unknown",
							totalMemoryBytes: result.total_memory_bytes || 0,
							availableMemoryBytes: result.available_memory_bytes || 0,
							totalDiskBytes: result.total_disk_bytes || 0,
							availableDiskBytes: result.available_disk_bytes || 0,
							cpuModel: result.cpu_model || "Unknown",
							cpuCores: result.cpu_cores || 0,
							gpuModel: result.gpu_model || "Unknown",
						},
						systemInfoLoaded: true,
						systemInfoLoading: false,
					});
				} catch (error) {
					console.error("Failed to fetch system info:", error);
					set({
						systemInfo: EMPTY_SYSTEM_INFO,
						systemInfoLoaded: true,
						systemInfoLoading: false,
					});
				}
			},
		}),
		{
			name: "ui-storage",
			storage: createJSONStorage(() => localStorage),
		},
	),
);
