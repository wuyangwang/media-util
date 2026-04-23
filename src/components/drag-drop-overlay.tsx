import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DragDropOverlayProps {
	active: boolean;
	title: string;
	description: string;
}

export function DragDropOverlay({
	active,
	title,
	description,
}: DragDropOverlayProps) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-0 z-40 flex items-center justify-center transition-opacity duration-200",
				active ? "opacity-100" : "opacity-0",
			)}
			aria-hidden="true"
		>
			<div
				className={cn(
					"absolute inset-3 rounded-xl border-2 border-dashed transition-colors duration-200",
					active ? "border-primary/70 bg-primary/10" : "border-transparent",
				)}
			/>
			<div
				className={cn(
					"rounded-lg border bg-background/92 px-5 py-4 text-center shadow-lg backdrop-blur-sm transition-all duration-200",
					active
						? "translate-y-0 scale-100 border-primary/40"
						: "translate-y-1 scale-95 border-transparent",
				)}
			>
				<div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
					<Upload className="size-4" />
				</div>
				<p className="text-sm font-semibold text-foreground">{title}</p>
				<p className="mt-1 text-xs text-muted-foreground">{description}</p>
			</div>
		</div>
	);
}
