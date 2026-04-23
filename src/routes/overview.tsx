import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Image as ImageIcon,
	Settings2,
	Video,
	HardDriveDownload,
	LayoutGrid,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function OverviewPage() {
	return (
		<main className="min-h-full bg-background p-4 md:p-5">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
				<section className="window-surface">
					<CardHeader className="pb-3">
						<div className="window-section-title">Workspace</div>
						<CardTitle className="text-xl">媒体处理工作台</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2 pb-4 md:grid-cols-4">
						<QuickLink
							to="/videos"
							icon={Video}
							title="视频处理"
							desc="转码、压缩、提取音频"
						/>
						<QuickLink
							to="/images"
							icon={ImageIcon}
							title="图片处理"
							desc="转换、裁剪、压缩"
						/>
						<QuickLink
							to="/settings"
							icon={Settings2}
							title="设置"
							desc="并发、主题、偏好"
						/>
						<QuickLink
							to="/overview"
							icon={LayoutGrid}
							title="概览"
							desc={`版本 ${import.meta.env.APP_VERSION}`}
						/>
					</CardContent>
				</section>

				<section className="grid gap-4 md:grid-cols-2">
					<Card className="window-surface">
						<CardHeader className="pb-2">
							<div className="window-section-title">Processing</div>
							<CardTitle className="text-base">处理建议</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-sm text-muted-foreground">
							<p>1. 拖拽文件或文件夹到窗口，可自动识别并分流到视频/图片页。</p>
							<p>2. 批量任务建议先确认预设，再统一执行，避免重复导出。</p>
							<p>3. 大批量处理时可在设置中调整并发，优先保证系统流畅。</p>
						</CardContent>
					</Card>

					<Card className="window-surface">
						<CardHeader className="pb-2">
							<div className="window-section-title">Output</div>
							<CardTitle className="text-base">导出与分发</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<HardDriveDownload className="size-4" />
								<span>支持单文件导出与批量 ZIP 打包导出</span>
							</div>
							<div className="h-px w-full bg-border" />
							<div className="flex gap-2">
								<Button asChild size="sm" variant="outline">
									<Link to="/videos">前往视频处理</Link>
								</Button>
								<Button asChild size="sm" variant="outline">
									<Link to="/images">前往图片处理</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				</section>
			</div>
		</main>
	);
}

function QuickLink({
	to,
	icon: Icon,
	title,
	desc,
}: {
	to: "/overview" | "/videos" | "/images" | "/settings";
	icon: any;
	title: string;
	desc: string;
}) {
	return (
		<Button
			asChild
			variant="outline"
			className="h-auto justify-start rounded-sm px-3 py-2"
		>
			<Link to={to} className="flex w-full items-center gap-2">
				<div className="rounded-sm bg-primary/12 p-1">
					<Icon className="size-4 text-primary" />
				</div>
				<div className="flex flex-col items-start text-left">
					<span className="text-sm font-medium text-foreground">{title}</span>
					<span className="text-xs text-muted-foreground">{desc}</span>
				</div>
			</Link>
		</Button>
	);
}

export const Route = createFileRoute("/overview")({
	component: OverviewPage,
});
