import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface UsePickMediaInputsOptions {
	modeLabel: string;
	extensions: string[];
	checkProcessing: () => boolean;
	handleAddPaths: (paths: string[]) => Promise<void>;
	multipleFiles?: boolean;
}

export function usePickMediaInputs({
	modeLabel,
	extensions,
	checkProcessing,
	handleAddPaths,
	multipleFiles = true,
}: UsePickMediaInputsOptions) {
	const handlePickFiles = useCallback(async () => {
		if (checkProcessing()) return;
		const files = await open({
			multiple: multipleFiles,
			filters: [{ name: modeLabel, extensions }],
		});
		if (files) {
			await handleAddPaths(Array.isArray(files) ? files : [files]);
		}
	}, [checkProcessing, extensions, handleAddPaths, modeLabel, multipleFiles]);

	const handlePickDir = useCallback(async () => {
		if (checkProcessing()) return;
		const dir = await open({ directory: true });
		if (dir) {
			await handleAddPaths([dir as string]);
		}
	}, [checkProcessing, handleAddPaths]);

	return { handlePickFiles, handlePickDir };
}
