import type { LucideIcon } from "lucide-react";

interface TaskEmptyStateProps {
	icon: LucideIcon;
	title: string;
	description: string;
}

export function TaskEmptyState({
	icon: Icon,
	title,
	description,
}: TaskEmptyStateProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/10 text-muted-foreground animate-in fade-in duration-500">
			<Icon className="mb-4 size-16 opacity-10" />
			<p className="text-lg font-medium opacity-50">{title}</p>
			<p className="text-sm opacity-40">{description}</p>
		</div>
	);
}
