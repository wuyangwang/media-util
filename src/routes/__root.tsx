import {
	createRootRoute,
	Link,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import {
	Play,
	Image as ImageIcon,
	Settings2,
	Film,
	LayoutGrid,
	PanelLeftClose,
	PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useEffect } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useUIStore } from "@/hooks/useUIStore";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useTaskStore } from "@/hooks/useTaskStore";
import { DEFAULT_CONFIG } from "@/lib/config";
import { toast } from "sonner";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	const sidebarRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLElement>(null);
	const { isSidebarCollapsed, toggleSidebar } = useUIStore();
	const navigate = useNavigate();
	const addVideoTasks = useTaskStore((s) => s.addVideoTasks);
	const addImageTasks = useTaskStore((s) => s.addImageTasks);

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
		const unlisten = getCurrentWebview().onDragDropEvent((event) => {
			const payload = event.payload as any;
			if (payload.type === "drop") {
				const paths = payload.paths as string[];
				const videoFiles: string[] = [];
				const imageFiles: string[] = [];

				for (const path of paths) {
					const ext = path.split(".").pop()?.toLowerCase() || "";
					if (DEFAULT_CONFIG.video_extensions.includes(ext)) {
						videoFiles.push(path);
					} else if (DEFAULT_CONFIG.image_extensions.includes(ext)) {
						imageFiles.push(path);
					}
				}

				if (videoFiles.length > 0) {
					const newTasks = videoFiles.map((path) => ({
						id: Math.random().toString(36).substring(7),
						path,
						fileName: path.split(/[\\/]/).pop() || path,
						status: "pending" as const,
						progress: 0,
					}));
					addVideoTasks(newTasks);
					navigate({ to: "/videos" });
					toast.success(`已添加 ${videoFiles.length} 个视频任务`);
				}

				if (imageFiles.length > 0) {
					const newTasks = imageFiles.map((path) => ({
						id: Math.random().toString(36).substring(7),
						path,
						fileName: path.split(/[\\/]/).pop() || path,
						status: "pending" as const,
					}));
					addImageTasks(newTasks);
					if (videoFiles.length === 0) {
						navigate({ to: "/images" });
					}
					toast.success(`已添加 ${imageFiles.length} 个图片任务`);
				}
			}
		});

		return () => {
			unlisten.then((fn: any) => typeof fn === "function" && fn());
		};
	}, [navigate, addVideoTasks, addImageTasks]);

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
					{!isSidebarCollapsed && (
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
						to="/settings"
						label="设置"
						icon={Settings2}
						isCollapsed={isSidebarCollapsed}
					/>
				</nav>
				{!isSidebarCollapsed && (
					<div className="window-toolbar p-2 text-center text-[10px] font-medium tracking-wide text-muted-foreground">
						v{import.meta.env.APP_VERSION}
					</div>
				)}
			</aside>

			{/* Main Content */}
			<main ref={contentRef} className="m-2 ml-2 flex min-w-0 flex-1 flex-col">
				<header className="window-surface window-toolbar flex h-10 shrink-0 items-center justify-between px-3">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Film className="size-3.5" />
						<span className="font-medium">Media Utility Desktop Workspace</span>
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
