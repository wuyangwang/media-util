import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface MediaPreviewDialogProps {
	children: ReactNode;
	type: "image" | "video";
	path: string;
	fileName: string;
}

export function MediaPreviewDialog({
	children,
	type,
	path,
	fileName,
}: MediaPreviewDialogProps) {
	const src = convertFileSrc(path);

	return (
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-w-[90vw] max-h-[90vh] p-1 overflow-hidden border-none bg-black/90">
				<DialogHeader className="absolute top-4 left-4 z-10 p-2 rounded bg-black/50 backdrop-blur-sm text-white opacity-0 hover:opacity-100 transition-opacity">
					<DialogTitle className="text-sm font-medium truncate max-w-[300px]">
						{fileName}
					</DialogTitle>
				</DialogHeader>
				<div className="flex items-center justify-center w-full h-full min-h-[50vh]">
					{type === "image" ? (
						<img
							src={src}
							alt={fileName}
							className="max-w-full max-h-[85vh] object-contain select-none"
						/>
					) : (
						<video
							src={src}
							controls
							autoPlay
							className="max-w-full max-h-[85vh] object-contain"
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
