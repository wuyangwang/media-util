import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Download, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ResourceStatus {
	id: string;
	label: string;
	downloaded: boolean;
	status: string;
}

interface DownloadProgress {
	model_id: string;
	progress: number;
	status: string;
	message?: string;
}

export function DetectionResourceManager() {
	const [status, setStatus] = useState<ResourceStatus | null>(null);
	const [downloading, setDownloading] = useState<DownloadProgress | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchStatus = useCallback(async () => {
		try {
			const resStatus = await invoke<ResourceStatus>(
				"get_detection_resources_status",
			);
			setStatus(resStatus);
		} catch (err) {
			console.error("Failed to fetch detection resources status:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchStatus();

		const unlisten = listen<DownloadProgress>(
			"model-download-progress",
			(event) => {
				const { model_id, progress, status, message } = event.payload;
				if (model_id === "yolo-resources") {
					setDownloading({ model_id, progress, status, message });

					if (status === "ready") {
						fetchStatus();
						setDownloading(null);
					}
				}
			},
		);

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [fetchStatus]);

	const handleDownload = async () => {
		try {
			await invoke("download_detection_resource");
		} catch (err) {
			toast.error(`下载失败: ${err}`);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center p-4">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!status || status.downloaded) return null;

	const isDownloading =
		downloading &&
		downloading.status !== "ready" &&
		downloading.status !== "downloaded";

	return (
		<Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
			<CardContent className="p-4">
				<div className="flex items-start gap-3">
					<AlertCircle className="mt-0.5 size-5 text-amber-600" />
					<div className="flex-1 space-y-3">
						<div className="flex items-center justify-between gap-4">
							<div>
								<h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
									缺少运行资源
								</h4>
								<p className="text-xs text-amber-700 dark:text-amber-400">
									运行目标检测需要下载 YOLO 模型和中文字体文件（约 50MB）。
								</p>
							</div>
							{!isDownloading && (
								<Button size="sm" onClick={handleDownload} className="shrink-0">
									<Download className="mr-2 size-4" />
									一键下载
								</Button>
							)}
						</div>

						{isDownloading && (
							<div className="space-y-1.5">
								<div className="flex justify-between text-xs font-medium text-amber-900 dark:text-amber-200">
									<span>{downloading.message || "正在下载资源..."}</span>
									<span>{Math.round(downloading.progress)}%</span>
								</div>
								<Progress value={downloading.progress} className="h-1.5" />
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
