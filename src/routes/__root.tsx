import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Video, Image as ImageIcon, Settings, Film, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	const sidebarRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLElement>(null);

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
			<aside ref={sidebarRef} className="w-64 border-r flex flex-col bg-muted/30">
				<div className="p-6 border-b flex items-center gap-2">
					<Film className="size-6 text-primary" />
					<h1 className="text-xl font-bold tracking-tight">媒体工具</h1>
				</div>
				<nav className="flex-1 p-4 space-y-2">
					<SidebarLink to="/overview" label="概览" icon={LayoutDashboard} />
					<SidebarLink to="/videos" label="视频" icon={Video} />
					<SidebarLink to="/images" label="图片" icon={ImageIcon} />
					<SidebarLink to="/settings" label="设置" icon={Settings} />
				</nav>
				<div className="p-4 border-t text-xs text-muted-foreground text-center">
					v0.9.0
				</div>
			</aside>

			{/* Main Content */}
			<main ref={contentRef} className="flex-1 overflow-y-auto relative">
				<Outlet />
			</main>

			<Toaster position="top-right" />
		</div>
	);
}

function SidebarLink({
	to,
	label,
	icon: Icon,
}: {
	to: string;
	label: string;
	icon: any;
}) {
	return (
		<Link
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
