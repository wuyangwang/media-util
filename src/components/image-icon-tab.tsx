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
			<div className="grid gap-2 grid-cols-1">
				{APP_ICON_PRESETS.map((preset) => (
					<Button
						key={preset.platform}
						type="button"
						variant="ghost"
						disabled={disabled}
						onClick={() => onTogglePlatform(preset.platform)}
						className={cn(
							"h-auto items-start justify-start rounded-md border bg-background/60 p-3 text-left whitespace-normal",
							selectedPlatforms.includes(preset.platform)
								? "border-primary bg-primary/8"
								: "border-border",
						)}
					>
						<div className="mb-2 flex flex-col items-start gap-0.5">
							<span className="text-sm font-bold text-foreground">
								{preset.platform}
							</span>
							<span className="font-mono text-[10px] font-medium uppercase text-muted-foreground/70">
								{preset.format}
							</span>
						</div>
						<p className="text-[11px] leading-relaxed text-muted-foreground/90">
							{preset.description}
						</p>
						<div className="mt-3 flex flex-wrap gap-1.5">
							{preset.sizes.map((size) => (
								<span
									key={size}
									className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
								>
									{size}x{size}
								</span>
							))}
						</div>
					</Button>
				))}
			</div>
		</div>
	);
}
