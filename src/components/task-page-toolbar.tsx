import { Button } from "@/components/ui/button";
import { Plus, FolderPlus, Play, XCircle, Loader2 } from "lucide-react";

interface TaskPageToolbarProps {
	title: string;
	descriptionIdle: string;
	descriptionScanning: string;
	pickFilesLabel: string;
	pickDirLabel: string;
	showPickDirButton?: boolean;
	showStartBatchButton?: boolean;
	showClearButton?: boolean;
	isScanning: boolean;
	isProcessing: boolean;
	isAnyProcessing: boolean;
	hasTasks: boolean;
	onPickFiles: () => void | Promise<void>;
	onPickDir: () => void | Promise<void>;
	onStartBatch: () => void | Promise<void>;
	onClearTasks: () => void | Promise<void>;
}

export function TaskPageToolbar({
	title,
	descriptionIdle,
	descriptionScanning,
	pickFilesLabel,
	pickDirLabel,
	showPickDirButton = true,
	showStartBatchButton = true,
	showClearButton = true,
	isScanning,
	isProcessing,
	isAnyProcessing,
	hasTasks,
	onPickFiles,
	onPickDir,
	onStartBatch,
	onClearTasks,
}: TaskPageToolbarProps) {
	return (
		<header className="header-animate flex items-center justify-between border-b p-6">
			<div>
				<h2 className="text-2xl font-bold tracking-tight">{title}</h2>
				<p className="text-sm text-muted-foreground">
					{isScanning ? descriptionScanning : descriptionIdle}
				</p>
			</div>
			<div className="flex gap-2">
				<Button
					onClick={onPickFiles}
					variant="outline"
					size="sm"
					title={pickFilesLabel}
				>
					{isScanning ? (
						<Loader2 className="mr-1 size-4 animate-spin" />
					) : (
						<Plus data-icon="inline-start" />
					)}
					{pickFilesLabel}
				</Button>
				{showPickDirButton && (
					<Button
						onClick={onPickDir}
						variant="outline"
						size="sm"
						title={pickDirLabel}
					>
						{isScanning ? (
							<Loader2 className="mr-1 size-4 animate-spin" />
						) : (
							<FolderPlus data-icon="inline-start" />
						)}
						{pickDirLabel}
					</Button>
				)}
				{showStartBatchButton && (
					<Button
						onClick={onStartBatch}
						size="sm"
						title={
							isAnyProcessing
								? "正在处理中..."
								: hasTasks
									? "开始处理"
									: "请先添加文件"
						}
					>
						{isProcessing ? (
							<Loader2 className="mr-1 size-4 animate-spin" />
						) : (
							<Play data-icon="inline-start" />
						)}
						全部开始
					</Button>
				)}
				{showClearButton && (
					<Button
						onClick={onClearTasks}
						variant="ghost"
						size="sm"
						className="text-destructive"
						title={isAnyProcessing ? "正在处理中，无法清空" : "清空任务列表"}
					>
						<XCircle data-icon="inline-start" /> 清空
					</Button>
				)}
			</div>
		</header>
	);
}
