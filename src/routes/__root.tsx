import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	Play,
	Image as ImageIcon,
	Mic2,
	Settings2,
	Film,
	LayoutGrid,
	PanelLeftClose,
	PanelLeftOpen,
	Scan,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useEffect, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useUIStore } from "@/hooks/useUIStore";
import { invoke } from "@tauri-apps/api/core";
import { useTaskStore } from "@/hooks/useTaskStore";
import { useDetectionStore } from "@/hooks/useDetectionStore";
import { listen } from "@tauri-apps/api/event";
import { VersionDisplay } from "@/components/version-display";
import { toast } from "sonner";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	const sidebarRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLElement>(null);
	const { isSidebarCollapsed, toggleSidebar } = useUIStore();
	const [showSidebarTitle, setShowSidebarTitle] = useState(!isSidebarCollapsed);
	const setTranscribeTask = useTaskStore((s) => s.setTranscribeTask);
	const setTranscribeProcessing = useTaskStore(
		(s) => s.setTranscribeProcessing,
	);
	const consumeTaskRecoveredCount = useTaskStore(
		(s) => s.consumeRecoveredCount,
	);
	const consumeDetectionRecoveredCount = useDetectionStore(
		(s) => s.consumeRecoveredCount,
	);

	useEffect(() => {
		if (isSidebarCollapsed) {
			setShowSidebarTitle(false);
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setShowSidebarTitle(true);
		}, 1000);

		return () => window.clearTimeout(timeoutId);
	}, [isSidebarCollapsed]);

	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I")) {
				e.preventDefault();
				try {
					await invoke("open_devtools");
				} catch (err) {
					console.error("Failed to open devtools:", err);
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		const restoredCount =
			consumeTaskRecoveredCount() + consumeDetectionRecoveredCount();
		if (restoredCount > 0) {
			toast.success(`已恢复 ${restoredCount} 个任务，可继续处理`);
		}
	}, [consumeDetectionRecoveredCount, consumeTaskRecoveredCount]);

	useEffect(() => {
		let mounted = true;
		const unlistenFns: Array<() => void> = [];

		listen<{
			id: string;
			progress: number;
			status:
				| "pending"
				| "preparing"
				| "normalizing_audio"
				| "transcribing"
				| "completed"
				| "failed";
			output_path?: string;
			log?: string;
		}>("transcription-progress", (event) => {
			if (!mounted) return;
			const payload = event.payload;
			setTranscribeTask((prev) => {
				if (!prev || prev.id !== payload.id) return prev;

				return {
					...prev,
					status: payload.status,
					progress: payload.progress,
					outputPath: payload.output_path || prev.outputPath,
					log: payload.log,
				};
			});
			if (payload.status === "completed" || payload.status === "failed") {
				setTranscribeProcessing(false);
			}
		}).then((fn) => unlistenFns.push(fn));

		return () => {
			mounted = false;
			for (const fn of unlistenFns) fn();
		};
	}, [setTranscribeProcessing, setTranscribeTask]);

	useGSAP(() => {
		const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

		tl.from(sidebarRef.current, {
			x: -20,
			opacity: 0,
			duration: 0.6,
		}).from(
			contentRef.current,
			{
				opacity: 0,
				duration: 0.8,
			},
			"-=0.4",
		);
	});

	return (
		<TooltipProvider>
			<div className="flex h-screen w-full overflow-hidden bg-background font-sans antialiased">
				{/* Sidebar */}
				<aside
					ref={sidebarRef}
					className={cn(
						"window-surface m-2 mr-0 flex flex-col transition-all duration-200",
						isSidebarCollapsed ? "w-14" : "w-56",
					)}
				>
					<div
						className={cn(
							"window-toolbar flex h-12 items-center gap-2",
							isSidebarCollapsed ? "justify-center" : "justify-between px-3",
						)}
					>
						{!isSidebarCollapsed && showSidebarTitle && (
							<div className="flex items-center gap-2">
								<Film className="size-4 text-primary" />
								<h1 className="text-sm font-semibold tracking-normal">
									媒体工具
								</h1>
							</div>
						)}
						<button
							onClick={toggleSidebar}
							className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							{isSidebarCollapsed ? (
								<PanelLeftOpen size={16} />
							) : (
								<PanelLeftClose size={16} />
							)}
						</button>
					</div>
					<nav className="flex-1 space-y-1 p-2">
						<SidebarLink
							to="/overview"
							label="概览"
							icon={LayoutGrid}
							isCollapsed={isSidebarCollapsed}
						/>
						<SidebarLink
							to="/videos"
							label="视频"
							icon={Play}
							isCollapsed={isSidebarCollapsed}
						/>
						<SidebarLink
							to="/images"
							label="图片"
							icon={ImageIcon}
							isCollapsed={isSidebarCollapsed}
						/>
						<SidebarLink
							to="/transcribe"
							label="转文字"
							icon={Mic2}
							isCollapsed={isSidebarCollapsed}
						/>
						<SidebarLink
							to="/detection"
							label="目标检测"
							icon={Scan}
							isCollapsed={isSidebarCollapsed}
						/>
						<SidebarLink
							to="/settings"
							label="设置"
							icon={Settings2}
							isCollapsed={isSidebarCollapsed}
						/>
					</nav>
					<VersionDisplay isCollapsed={isSidebarCollapsed} />
				</aside>

				{/* Main Content */}
				<main
					ref={contentRef}
					className="m-2 ml-2 flex min-w-0 flex-1 flex-col"
				>
					<header className="window-surface window-toolbar flex h-10 shrink-0 items-center justify-between px-3">
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Film className="size-3.5" />
							<span className="font-medium">媒体工具桌面工作区</span>
						</div>
						<div className="text-[11px] text-muted-foreground">
							拖拽文件到窗口可快速添加任务
						</div>
					</header>
					<section className="window-surface mt-2 min-h-0 flex-1 overflow-y-auto">
						<Outlet />
					</section>
				</main>

				<Toaster position="bottom-right" duration={2200} />
			</div>
		</TooltipProvider>
	);
}

function SidebarLink({
	to,
	label,
	icon: Icon,
	isCollapsed,
}: {
	to: string;
	label: string;
	icon: any;
	isCollapsed: boolean;
}) {
	return (
		<Link
			to={to}
			className={cn(
				"group flex items-center rounded-sm transition-colors duration-150 hover:bg-muted",
				isCollapsed ? "mx-auto h-9 w-9 justify-center" : "gap-2 px-2 py-1.5",
			)}
			activeProps={{
				className: "bg-accent text-foreground ring-1 ring-border",
			}}
			title={isCollapsed ? label : undefined}
		>
			<Icon
				className={cn(
					"transition-transform duration-150 group-hover:scale-105",
					isCollapsed ? "size-5" : "size-4",
				)}
			/>
			{!isCollapsed && <span className="text-sm font-medium">{label}</span>}
		</Link>
	);
}
