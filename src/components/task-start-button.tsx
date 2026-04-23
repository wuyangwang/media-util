import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Task } from "@/hooks/useTasks";

interface TaskStartButtonProps {
	status: Task["status"];
	onStart: () => void | Promise<void>;
}

export function TaskStartButton({ status, onStart }: TaskStartButtonProps) {
	if (status === "processing" || status === "converting") {
		return null;
	}

	const title =
		status === "failed"
			? "重新处理"
			: status === "completed"
				? "再次处理"
				: "开始处理";

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className="h-8 w-8 text-primary hover:bg-primary/10"
			onClick={onStart}
			title={title}
		>
			<Play className="size-4" />
		</Button>
	);
}
