import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_PRESETS } from "@/lib/icon-presets";

interface ImageIconTabProps {
	selectedPlatforms: string[];
	onTogglePlatform: (platform: string) => void;
	disabled?: boolean;
}

export function ImageIconTab({
	selectedPlatforms,
	onTogglePlatform,
	disabled = false,
}: ImageIconTabProps) {
	return (
		<div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
			<p className="text-xs text-muted-foreground">
				先选择目标平台，再根据输入图片生成对应图标。每个任务完成后输出一个 ZIP
				压缩包。
			</p>
			<div className="grid gap-2 md:grid-cols-2">
				{APP_ICON_PRESETS.map((preset) => (
					<Button
						key={preset.platform}
						type="button"
						variant="ghost"
						disabled={disabled}
						onClick={() => onTogglePlatform(preset.platform)}
						className={cn(
							"h-auto items-start justify-start rounded-md border bg-background/60 p-3 text-left",
							selectedPlatforms.includes(preset.platform)
								? "border-primary bg-primary/8"
								: "border-border",
						)}
					>
						<div className="mb-1 flex items-center justify-between">
							<span className="text-xs font-semibold">{preset.platform}</span>
							<span className="font-mono text-[10px] uppercase text-muted-foreground">
								{preset.format}
							</span>
						</div>
						<p className="text-[11px] text-muted-foreground">
							{preset.description}
						</p>
						<p className="mt-2 font-mono text-[10px] text-muted-foreground/80">
							{preset.sizes.map((size) => `${size}x${size}`).join(" · ")}
						</p>
					</Button>
				))}
			</div>
		</div>
	);
}
