import { createFileRoute } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Monitor, Moon, Sun, FolderOpen } from "lucide-react";

export const Route = createFileRoute("/settings")({
	component: Settings,
});

function Settings() {
	const { theme, setTheme } = useTheme();

	return (
		<div className="flex flex-col h-full bg-background">
			<header className="p-6 border-b">
				<h2 className="text-2xl font-bold tracking-tight">设置</h2>
				<p className="text-muted-foreground">
					自定义您的应用偏好和工作流设置。
				</p>
			</header>

			<div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Sun className="w-5 h-5" />
							界面外观
						</CardTitle>
						<CardDescription>选择您喜欢的主题模式。</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-4">
							<span className="text-sm font-medium">应用主题:</span>
							<Select value={theme} onValueChange={setTheme}>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="选择主题" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="light">
										<div className="flex items-center gap-2">
											<Sun className="w-4 h-4" />
											<span>浅色模式</span>
										</div>
									</SelectItem>
									<SelectItem value="dark">
										<div className="flex items-center gap-2">
											<Moon className="w-4 h-4" />
											<span>深色模式</span>
										</div>
									</SelectItem>
									<SelectItem value="system">
										<div className="flex items-center gap-2">
											<Monitor className="w-4 h-4" />
											<span>跟随系统</span>
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FolderOpen className="w-5 h-5" />
							路径设置
						</CardTitle>
						<CardDescription>自定义转换后文件的保存位置。</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center gap-4">
							<span className="text-sm font-medium shrink-0">
								默认输出目录:
							</span>
							<div className="flex-1 p-2 bg-muted rounded-md border text-sm font-mono truncate">
								与源文件相同
							</div>
							<Button variant="outline" size="sm" disabled>
								更改目录
							</Button>
						</div>
						<p className="text-xs text-muted-foreground italic">
							目前版本默认将转换后的文件保存在原文件所在目录。
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>关于应用</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">应用名称:</span>
							<span className="font-medium">Media Utility</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">当前版本:</span>
							<span className="font-medium">v0.1.0</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">核心引擎:</span>
							<span className="font-medium">FFmpeg 7.x & image crate</span>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
