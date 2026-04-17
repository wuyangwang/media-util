import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Video, Image as ImageIcon, Settings, Film, LayoutDashboard, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useUIStore } from "@/hooks/useUIStore";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	const sidebarRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLElement>(null);
	const { isSidebarCollapsed, toggleSidebar } = useUIStore();

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
			<aside ref={sidebarRef} className={cn("border-r flex flex-col bg-muted/30 transition-all duration-300", isSidebarCollapsed ? "w-16" : "w-64")}>
				<div className="p-6 border-b flex items-center justify-between gap-2">
					{!isSidebarCollapsed && (
						<div className="flex items-center gap-2">
							<Film className="size-6 text-primary" />
							<h1 className="text-xl font-bold tracking-tight">媒体工具</h1>
						</div>
					)}
					<button onClick={toggleSidebar} className="p-1 rounded-md hover:bg-muted">
						{isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
					</button>
				</div>
				<nav className="flex-1 p-4 space-y-2">
					<SidebarLink to="/overview" label="概览" icon={LayoutDashboard} isCollapsed={isSidebarCollapsed} />
					<SidebarLink to="/videos" label="视频" icon={Video} isCollapsed={isSidebarCollapsed} />
					<SidebarLink to="/images" label="图片" icon={ImageIcon} isCollapsed={isSidebarCollapsed} />
					<SidebarLink to="/settings" label="设置" icon={Settings} isCollapsed={isSidebarCollapsed} />
				</nav>
				{!isSidebarCollapsed && (
					<div className="p-4 border-t text-xs text-muted-foreground text-center">
						v0.9.0
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
				"flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-muted",
				isCollapsed ? "justify-center" : "justify-start"
			)}
			title={isCollapsed ? label : undefined}
		>
			<Icon className="size-5" />
			{!isCollapsed && <span>{label}</span>}
		</Link>
	);
}

			to={to}
			activeProps={{
				className: "bg-primary text-primary-foreground shadow-sm",
			}}
			inactiveProps={{
				className: "text-muted-foreground hover:bg-muted hover:text-foreground",
			}}
			className={cn(
				"flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 font-medium",
			)}
		>
			<Icon className="size-5" />
			<span>{label}</span>
		</Link>
	);
}
