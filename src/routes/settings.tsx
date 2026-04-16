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
import { Monitor, Moon, Sun, FolderOpen, Info } from "lucide-react";
import { useRef, useCallback } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export const Route = createFileRoute("/settings")({
	component: Settings,
});

function Settings() {
	const { theme, setTheme } = useTheme();
	const containerRef = useRef<HTMLDivElement>(null);

	useGSAP(() => {
		gsap.from(".settings-animate", {
			y: 20,
			opacity: 0,
			stagger: 0.1,
			duration: 0.5,
			ease: "power2.out"
		});
	}, { scope: containerRef });

	const handleThemeChange = useCallback((value: string) => {
		setTheme(value);
	}, [setTheme]);

	return (
		<div ref={containerRef} className="flex flex-col h-full bg-background">
			<header className="p-6 border-b settings-animate">
				<h2 className="text-2xl font-bold tracking-tight">设置</h2>
				<p className="text-muted-foreground">
					自定义您的应用偏好和工作流设置。
				</p>
			</header>

			<div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
				<Card className="settings-animate">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Sun className="size-5" />
							界面外观
						</CardTitle>
						<CardDescription>选择您喜欢的主题模式。</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-4">
							<span className="text-sm font-medium text-foreground">应用主题:</span>
							<Select value={theme} onValueChange={handleThemeChange}>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="选择主题" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="light">
										<div className="flex items-center gap-2">
											<Sun className="size-4" />
											<span>浅色模式</span>
										</div>
									</SelectItem>
									<SelectItem value="dark">
										<div className="flex items-center gap-2">
											<Moon className="size-4" />
											<span>深色模式</span>
										</div>
									</SelectItem>
									<SelectItem value="system">
										<div className="flex items-center gap-2">
											<Monitor className="size-4" />
											<span>跟随系统</span>
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</CardContent>
				</Card>

				<Card className="settings-animate">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FolderOpen className="size-5" />
							路径设置
						</CardTitle>
						<CardDescription>自定义转换后文件的保存位置。</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center gap-4">
							<span className="text-sm font-medium shrink-0 text-foreground">
								默认输出目录:
							</span>
							<div className="flex-1 p-2 bg-muted rounded-md border text-sm font-mono truncate text-muted-foreground">
								与源文件相同
							</div>
							<Button variant="outline" size="sm" disabled>
								更改目录
							</Button>
						</div>
						<div className="flex items-start gap-2 text-xs text-muted-foreground italic">
							<Info className="size-3.5 mt-0.5" />
							<p>目前版本默认将转换后的文件保存在原文件所在目录。</p>
						</div>
					</CardContent>
				</Card>

				<Card className="settings-animate">
					<CardHeader>
						<CardTitle>关于应用</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground text-sm">应用名称:</span>
							<span className="font-medium text-foreground text-sm">媒体工具箱 (Media Utility)</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground text-sm">当前版本:</span>
							<span className="font-medium text-foreground text-sm">v0.9.0</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground text-sm">核心引擎:</span>
							<span className="font-medium text-foreground text-sm">FFmpeg 7.x & image 库</span>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
