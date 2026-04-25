import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_PRESETS } from "@/lib/icon-presets";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Monitor, Smartphone, Apple } from "lucide-react";

interface ImageIconTabProps {
	selectedPlatforms: string[];
	onTogglePlatform: (platform: string) => void;
	disabled?: boolean;
}

const PLATFORM_ICONS: Record<string, any> = {
	Windows: Monitor,
	macOS: Apple,
	Android: Smartphone,
	iOS: Smartphone,
};

export function ImageIconTab({
	selectedPlatforms,
	onTogglePlatform,
	disabled = false,
}: ImageIconTabProps) {
	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
			<div className="flex items-center justify-between gap-4">
				<p className="text-xs text-muted-foreground leading-snug max-w-[400px]">
					选择目标平台生成图标包。
					<span className="ml-1 text-[10px] opacity-70">
						(完成后输出 ZIP 压缩包)
					</span>
				</p>
				<div className="flex flex-wrap items-center gap-1.5">
					{APP_ICON_PRESETS.map((preset) => {
						const Icon = PLATFORM_ICONS[preset.platform] || Monitor;
						const isSelected = selectedPlatforms.includes(preset.platform);

						return (
							<Tooltip key={preset.platform}>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={disabled}
										onClick={() => onTogglePlatform(preset.platform)}
										className={cn(
											"h-8 gap-2 px-3 transition-all",
											isSelected
												? "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
												: "bg-background/50 hover:bg-background",
										)}
									>
										<Icon className="size-3.5" />
										<span className="text-xs font-medium">
											{preset.platform}
										</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent
									className="flex flex-col gap-1.5 p-3"
									side="top"
								>
									<div className="flex items-center justify-between gap-4">
										<span className="text-xs font-bold">{preset.platform}</span>
										<span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-primary">
											{preset.format}
										</span>
									</div>
									<p className="text-[11px] text-muted-foreground">
										{preset.description}
									</p>
									<div className="mt-1 flex flex-wrap gap-1">
										{preset.sizes.map((size) => (
											<span
												key={size}
												className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground border"
											>
												{size}x{size}
											</span>
										))}
									</div>
								</TooltipContent>
							</Tooltip>
						);
					})}
				</div>
			</div>
		</div>
	);
}
