import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Video, Image as ImageIcon, Zap, Shield, Rocket } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function OverviewPage() {
	const container = useRef<HTMLDivElement>(null);

	useGSAP(() => {
		const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
		
		tl.from(".hero-content > *", {
			y: 30,
			opacity: 0,
			stagger: 0.2,
			duration: 0.8
		})
		.from(".feature-card", {
			scale: 0.9,
			opacity: 0,
			stagger: 0.1,
			duration: 0.6
		}, "-=0.4");
	}, { scope: container });

	return (
		<main ref={container} className="min-h-screen bg-background p-8 md:p-12 lg:p-16 overflow-y-auto">
			<div className="max-w-5xl mx-auto space-y-16">
				{/* Hero Section */}
				<section className="hero-content text-center space-y-6 pt-8">
					<Badge variant="secondary" className="px-4 py-1 text-sm rounded-full">
						v0.9.0 Beta
					</Badge>
					<h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground">
						媒体工具箱 <span className="text-primary">Media Utility</span>
					</h1>
					<p className="text-xl text-muted-foreground max-w-2xl mx-auto">
						一款高效、简洁的跨平台媒体处理工具，旨在为您提供最便捷的音视频及图片处理方案。
					</p>
				</section>

				{/* Features Grid */}
				<section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					<FeatureCard 
						icon={Rocket} 
						title="高性能" 
						description="基于 FFmpeg 与 Rust 内核，多线程并行处理，速度飞快。"
					/>
					<FeatureCard 
						icon={Zap} 
						title="自动化" 
						description="文件夹自动化扫描，拖拽即处理，告别繁琐操作。"
					/>
					<FeatureCard 
						icon={Shield} 
						title="隐私安全" 
						description="本地离线处理，您的媒体文件永远不会离开您的计算机。"
					/>
					<FeatureCard 
						icon={ImageIcon} 
						title="多格式" 
						description="支持主流音视频及图片格式，覆盖日常所有转换需求。"
					/>
				</section>

				{/* Detailed Features */}
				<section className="grid grid-cols-1 md:grid-cols-2 gap-8">
					<Card className="feature-card border-none bg-muted/30 shadow-none">
						<CardHeader>
							<div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
								<Video className="size-6 text-primary" />
							</div>
							<CardTitle>视频批量处理</CardTitle>
							<CardDescription>
								支持批量格式转换、压缩、码率调整等功能。预设多种常用配置，一键完成。
							</CardDescription>
						</CardHeader>
					</Card>

					<Card className="feature-card border-none bg-muted/30 shadow-none">
						<CardHeader>
							<div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
								<ImageIcon className="size-6 text-primary" />
							</div>
							<CardTitle>图片智能处理</CardTitle>
							<CardDescription>
								支持批量裁剪、缩放、格式转换。内置智能裁剪算法，确保画面主体不丢失。
							</CardDescription>
						</CardHeader>
					</Card>
				</section>

				<footer className="hero-content text-center py-12 border-t text-muted-foreground">
					<p>由 @wuyang 开发 | 基于 Tauri & React 构建</p>
				</footer>
			</div>
		</main>
	);
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
	return (
		<Card className="feature-card group hover:bg-muted/50 transition-colors border-none bg-transparent shadow-none">
			<CardHeader className="p-4">
				<Icon className="size-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
				<CardTitle className="text-lg">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
		</Card>
	);
}

export const Route = createFileRoute("/overview")({
	component: OverviewPage,
});
