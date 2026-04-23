import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import "./index.css";
import { ThemeProvider } from "next-themes";
import { initConfig } from "./lib/config";
import { listen } from "@tauri-apps/api/event";
import { useTaskStore, type VideoProgressPayload } from "./hooks/useTaskStore";

const router = createRouter({ routeTree });

const queryClient = new QueryClient();

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

async function initApp() {
	// Disable default context menu
	document.addEventListener("contextmenu", (e) => e.preventDefault(), {
		capture: true,
	});

	await initConfig();

	listen<string>("navigate", (event) => {
		router.navigate({ to: event.payload as any });
	});

	listen<VideoProgressPayload>("conversion-progress", (event) => {
		useTaskStore.getState().applyVideoProgress(event.payload);
	});

	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				storageKey="media-util-theme"
				disableTransitionOnChange
			>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
				</QueryClientProvider>
			</ThemeProvider>
		</React.StrictMode>,
	);
}

initApp();
