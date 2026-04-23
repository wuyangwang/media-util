import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FolderOpen, Trash2 } from "lucide-react";

interface TaskItemActionsProps {
	statusBadge: ReactNode;
	startAction?: ReactNode;
	extraActions?: ReactNode;
	showOpenFolder?: boolean;
	onOpenFolder?: () => void;
	onRemove: () => void;
	openFolderTitle?: string;
	removeTitle?: string;
	containerClassName?: string;
}

export function TaskItemActions({
	statusBadge,
	startAction,
	extraActions,
	showOpenFolder = false,
	onOpenFolder,
	onRemove,
	openFolderTitle = "打开所在文件夹",
	removeTitle = "删除任务",
	containerClassName = "ml-4 flex shrink-0 items-center gap-1.5",
}: TaskItemActionsProps) {
	return (
		<div className={containerClassName}>
			{statusBadge}
			{startAction}
			{extraActions}
			{showOpenFolder && onOpenFolder && (
				<Button
					variant="ghost"
					size="icon-sm"
					className="h-8 w-8 text-primary hover:bg-primary/10"
					onClick={onOpenFolder}
					title={openFolderTitle}
				>
					<FolderOpen className="size-4" />
				</Button>
			)}
			<Button
				variant="ghost"
				size="icon-sm"
				className="h-8 w-8 text-muted-foreground transition-colors hover:text-destructive"
				onClick={onRemove}
				title={removeTitle}
			>
				<Trash2 className="size-4" />
			</Button>
		</div>
	);
}
