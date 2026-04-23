import type { Task } from "@/hooks/useTasks";

interface TaskStatusBadgeProps {
	status: Task["status"];
	label: string;
}

export function TaskStatusBadge({ status, label }: TaskStatusBadgeProps) {
	const className =
		status === "completed"
			? "bg-green-100 text-green-700"
			: status === "failed"
				? "bg-red-100 text-red-700"
				: status === "pending"
					? "bg-blue-100 text-blue-700"
					: "bg-primary/10 text-primary animate-pulse";

	return (
		<span
			className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${className}`}
		>
			{label}
		</span>
	);
}
