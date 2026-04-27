import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VersionDisplayProps {
	isCollapsed: boolean;
}

export function VersionDisplay({ isCollapsed }: VersionDisplayProps) {
	const [updateAvailable, setUpdateAvailable] = useState(false);
	const [updating, setUpdating] = useState(false);

	useEffect(() => {
		const checkUpdate = async () => {
			try {
				const update = await check();
				if (update?.available) {
					setUpdateAvailable(true);
					toast.info(`发现新版本 v${update.version}`, {
						description: "点击左下角按钮进行更新",
						duration: 5000,
					});
				}
			} catch (err) {
				console.error("Failed to check for updates:", err);
			}
		};

		// 初始检查
		checkUpdate();

		// 每小时检查一次
		const interval = setInterval(checkUpdate, 3600000);
		return () => clearInterval(interval);
	}, []);

	const handleUpdate = async () => {
		try {
			setUpdating(true);
			const update = await check();
			if (update?.available) {
				toast.loading("正在下载更新...", { id: "update-toast" });
				await update.downloadAndInstall();
				toast.success("更新已安装，请重启应用", {
					id: "update-toast",
					duration: 10000,
				});
			}
		} catch (err) {
			console.error("Update failed:", err);
			toast.error("更新失败，请稍后重试", { id: "update-toast" });
		} finally {
			setUpdating(false);
		}
	};

	if (isCollapsed) {
		return updateAvailable ? (
			<div className="flex justify-center p-2">
				<button
					type="button"
					onClick={handleUpdate}
					disabled={updating}
					className="text-primary hover:text-primary/80 transition-colors"
					title="有可用更新"
				>
					{updating ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<ArrowUpCircle className="size-4" />
					)}
				</button>
			</div>
		) : null;
	}

	return (
		<div className="window-toolbar mt-auto flex flex-col items-center gap-2 border-t p-2">
			<div className="text-[10px] font-medium tracking-wide text-muted-foreground/60">
				v{import.meta.env.APP_VERSION}
			</div>
			{updateAvailable && (
				<Button
					variant="ghost"
					size="sm"
					onClick={handleUpdate}
					disabled={updating}
					className="h-7 w-full gap-1.5 text-[11px] font-medium text-primary hover:bg-primary/5 hover:text-primary"
				>
					{updating ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<ArrowUpCircle className="size-3" />
					)}
					{updating ? "更新中" : "现在更新"}
				</Button>
			)}
		</div>
	);
}
