import { createRootRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { 
	Play, 
	Image as ImageIcon, 
	Settings2, 
	Film, 
	LayoutGrid, 
	PanelLeftClose, 
	PanelLeftOpen 
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
			duration: 0.6
		})
		.from(contentRef.current, {
			opacity: 0,
			duration: 0.8
		}, "-=0.4");
	});

	return (
		<div className="flex h-screen w-full bg-background font-sans antialiased overflow-hidden">
			{/* Sidebar */}
			<aside ref={sidebarRef} className={cn("border-r flex flex-col bg-muted/30 transition-all duration-300", isSidebarCollapsed ? "w-14" : "w-56")}>
				<div className={cn("border-b flex items-center gap-2 h-16", isSidebarCollapsed ? "justify-center" : "px-6 justify-between")}>
					{!isSidebarCollapsed && (
						<div className="flex items-center gap-2">
							<Film className="size-6 text-primary" />
							<h1 className="text-xl font-bold tracking-tight">媒体工具</h1>
						</div>
					)}
					<button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
						{isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
					</button>
				</div>
				<nav className="flex-1 p-3 space-y-2">
					<SidebarLink to="/overview" label="概览" icon={LayoutGrid} isCollapsed={isSidebarCollapsed} />
					<SidebarLink to="/videos" label="视频" icon={Play} isCollapsed={isSidebarCollapsed} />
					<SidebarLink to="/images" label="图片" icon={ImageIcon} isCollapsed={isSidebarCollapsed} />
					<SidebarLink to="/settings" label="设置" icon={Settings2} isCollapsed={isSidebarCollapsed} />
				</nav>
				{!isSidebarCollapsed && (
					<div className="p-4 border-t text-[10px] uppercase tracking-wider text-muted-foreground/50 text-center font-medium">
						v{import.meta.env.APP_VERSION}
					</div>
				)}
			</aside>

			{/* Main Content */}
			<main ref={contentRef} className="flex-1 overflow-y-auto relative">
				<Outlet />
			</main>

			<Toaster position="bottom-right" duration={2000} />
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
				"flex items-center rounded-md transition-all duration-200 hover:bg-muted group",
				isCollapsed ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2"
			)}
			activeProps={{
				className: "bg-primary/10 text-primary hover:bg-primary/15",
			}}
			title={isCollapsed ? label : undefined}
		>
			<Icon className={cn("transition-transform duration-200 group-hover:scale-110", isCollapsed ? "size-6" : "size-5")} />
			{!isCollapsed && <span className="font-medium">{label}</span>}
		</Link>
	);
}
