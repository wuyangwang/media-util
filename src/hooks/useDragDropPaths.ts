import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export function useDragDropPaths(
	onDropPaths: (paths: string[]) => void | Promise<void>,
) {
	const dragDepthRef = useRef(0);
	const [isDragActive, setIsDragActive] = useState(false);

	useEffect(() => {
		const unlistenDrop = getCurrentWebview().onDragDropEvent(async (event) => {
			const payload = event.payload as any;

			if (payload.type === "enter") {
				dragDepthRef.current += 1;
				setIsDragActive(true);
				return;
			}

			if (payload.type === "leave") {
				dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
				if (dragDepthRef.current === 0) {
					setIsDragActive(false);
				}
				return;
			}

			if (payload.type === "drop") {
				dragDepthRef.current = 0;
				setIsDragActive(false);
				const paths = payload.paths as string[];
				await onDropPaths(paths);
			}
		});

		return () => {
			dragDepthRef.current = 0;
			setIsDragActive(false);
			unlistenDrop.then((fn) => fn());
		};
	}, [onDropPaths]);

	return { isDragActive };
}
